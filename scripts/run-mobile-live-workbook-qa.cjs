// Explicitly authorized real-account QA. Workbook/password/token values stay in memory.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),ExcelJS=require('exceljs');
const {runAcceptance,QaFailure,readCredentialInput}=require('./check-mobile-live-qa.cjs');
const ensure=(value,code)=>{if(!value)throw new QaFailure(code);};
const fold=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/gi,'d').toLowerCase().replace(/[^a-z0-9]/g,'');
async function main(){
 const value=key=>{const index=process.argv.indexOf(key);ensure(index>=0&&process.argv[index+1],'QA_ARGUMENT_REQUIRED');return process.argv[index+1];};
 const filename=path.resolve(value('--workbook')),output=path.resolve(value('--output'));ensure(!fs.existsSync(output),'QA_OUTPUT_ALREADY_EXISTS');
 const skipIndex=process.argv.indexOf('--skip-user-id'),skipId=skipIndex>=0?Number(process.argv[skipIndex+1]):null;
 ensure(skipId===null||Number.isSafeInteger(skipId)&&skipId>0,'QA_SKIP_ID_INVALID');
 const bytes=fs.readFileSync(filename),sourceSha=crypto.createHash('sha256').update(bytes).digest('hex'),book=new ExcelJS.Workbook();await book.xlsx.load(bytes);
 let source;
 for(const sheet of book.worksheets)for(let index=1;index<=Math.min(sheet.rowCount,12);index++){
  if(source)break;let login=0,password=0;
  sheet.getRow(index).eachCell((cell,column)=>{const key=fold(cell.text);if(['taikhoan','tendangnhap','dangnhap','username','loginname'].includes(key))login=column;if(['matkhau','matkhaubandau','matkhautamthoi','password'].includes(key))password=column;});
  if(login&&password)source={sheet,header:index,login,password};
 }
 ensure(source,'QA_WORKBOOK_COLUMNS_NOT_FOUND');
 const rows=new Map();for(let i=source.header+1;i<=source.sheet.rowCount;i++){const row=source.sheet.getRow(i),login=row.getCell(source.login).text.trim();if(login)rows.set(login,row);}
 let input;try{input=JSON.parse((await readCredentialInput()).replace(/^\uFEFF/,''));}catch{throw new QaFailure('QA_INPUT_NOT_JSON');}
 input.mode='admin-and-branch';
 input.resolveBranch=async request=>{
  let pages=1;
  for(let page=1;page<=pages&&page<=50;page++){
   const response=await request('/api/mobile/v1/accounts?page='+page);ensure(response.status===200&&Array.isArray(response.value.rows),'QA_ACCOUNT_SELECTION_FAILED');
   ensure(Number.isSafeInteger(response.value.pages)&&response.value.pages>0,'QA_ACCOUNT_PAGES_INVALID');pages=response.value.pages;
   for(const account of response.value.rows){
    const login=account.login_name||account.email,credential=rows.get(login);
    if(!credential||account.id===skipId||account.access_role==='admin'||account.scope_all||!Number.isSafeInteger(account.store_id)||account.store_id<=0||account.status!=='active'||account.enabled===false||['leave','inactive'].includes(account.staff_status)||!Array.isArray(account.permissions)||!account.permissions.includes('contracts.read'))continue;
    const password=credential.getCell(source.password).text;ensure(password&&password.length<=256,'QA_WORKBOOK_PASSWORD_MISSING');
    input.selectionInfo={userId:account.id,storeId:account.store_id,source:'user-authorized-staff-workbook',sourceSha256:sourceSha,originalWorkbookUnchanged:true};
    return{username:login,password};
   }
  }
  throw new QaFailure('QA_NO_ENABLED_BRANCH_ACCOUNT_MATCHED_WORKBOOK');
 };
 const result=process.argv.includes('--notifications-only')?await require('./check-mobile-live-notifications.cjs').runNotificationAcceptance(input):await runAcceptance(input);ensure(crypto.createHash('sha256').update(fs.readFileSync(filename)).digest('hex')===sourceSha,'QA_WORKBOOK_CHANGED');
 fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,'results.json'),JSON.stringify(result,null,2));
 console.log(JSON.stringify({ok:result.ok,failureCode:result.failureCode||null,checks:result.checks.length,sessionsCreated:result.sessionsCreated,allCreatedSessionsRevoked:result.cleanup.every(row=>row.revoked),scopePositiveSampleFound:result.scopePositiveSampleFound||false,businessWrites:0,credentialValuesLogged:false,workbookUnchanged:true,output:path.relative(process.cwd(),output)},null,2));
 process.exitCode=result.ok?0:1;
}
main().catch(error=>{console.error(JSON.stringify({ok:false,code:error instanceof QaFailure?error.code:'QA_WORKBOOK_RUNNER_FAILED',credentialValuesLogged:false}));process.exitCode=1;});
