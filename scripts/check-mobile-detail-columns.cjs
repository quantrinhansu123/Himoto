const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{spawn}=require('node:child_process'),assert=require('node:assert/strict');
const ts=require('typescript'),React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
const root=path.resolve(__dirname,'../src'),cache=new Map();
function load(base){
  const filename=['.tsx','.ts'].map(extension=>base+extension).find(file=>fs.existsSync(file));
  if(!filename)throw new Error(`Missing fixture module: ${base}`);
  if(cache.has(filename))return cache.get(filename).exports;
  const module={exports:{}};cache.set(filename,module);
  const localRequire=name=>{
    if(name==='server-only')return {};
    if(name==='next/navigation')return {useRouter:()=>({push(){}})};
    if(name==='next/link')return {__esModule:true,default:({children,href,...props})=>React.createElement('a',{...props,href},children)};
    if(name.endsWith('/ManagementProvider')||name==='./ManagementProvider')return {useManagement:()=>({source:'demo',can:permission=>permission==='contracts.read',accessUser:{id:1}})};
    if(name==='./RecordPhotoFields')return {SavedRecordPhotos:()=>null};
    if(name==='./VehicleTransferTelegramPanel')return {VehicleTransferTelegramPanel:()=>null};
    return name.startsWith('@/')?load(path.join(root,name.slice(2))):name.startsWith('.')?load(path.resolve(path.dirname(filename),name)):require(name);
  };
  new Function('require','module','exports',ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText)(localRequire,module,module.exports);
  return module.exports;
}
const {VehicleDetail}=load(path.join(root,'components/management/VehicleDetail'));
const {MANAGEMENT_CONFIG}=load(path.join(root,'lib/management/config'));
const row={id:29,code:'#29',name:'VISION',license:'28G1-221.84',status:'using',type:'xega',color:'Đỏ',store_name:'CS Láng',holder_name:'NGUYỄN VĂN AN',customer_name:'NGUYỄN VĂN AN',beneficiary_store_name:'CS Láng',brand:'Honda',year:2024,daily_price:180000,monthly_price:2500000,
  rentals_json:JSON.stringify([{order_id:1,status:'renting',code:'011337',customer:'NGUYỄN VĂN AN'}])};
const markup=renderToStaticMarkup(React.createElement(VehicleDetail,{row,config:MANAGEMENT_CONFIG.vehicles,canEdit:false,onEdit(){},onClose(){},onAction(){}}));
const css=fs.readFileSync(path.join(root,'styles/management.css'),'utf8');
const out=path.resolve(__dirname,'../docs/qa/mobile-detail-columns');fs.mkdirSync(out,{recursive:true});
const fixture=path.join(out,'fixture.html');
fs.writeFileSync(fixture,`<!doctype html><html lang="vi"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Thông tin xe · kiểm tra bố cục</title><style>*{box-sizing:border-box}body{margin:0;font-family:Arial,sans-serif}${css}</style><body class="mg-app">${markup}<pre id="qa" hidden></pre><script>
document.querySelector('dialog').showModal();
const grid=document.querySelector('.mg-detail-grid'),dialog=document.querySelector('dialog');
const fields=[...grid.querySelectorAll('dd')];
const nav=dialog.querySelector('.mg-dialog-mobile-nav'),navRect=nav.getBoundingClientRect(),footer=dialog.querySelector('.mg-dialog-footer');
document.querySelector('#qa').textContent=JSON.stringify({width:innerWidth,columns:getComputedStyle(grid).gridTemplateColumns.split(' ').length,overflow:dialog.scrollWidth>dialog.clientWidth+1,fieldOverflow:fields.some(el=>el.scrollWidth>el.clientWidth+1),fields:fields.length,navVisible:navRect.height>0,navButtons:nav.querySelectorAll('button').length,navAtBottom:Math.abs(navRect.bottom-innerHeight)<2,footerAboveNav:footer.getBoundingClientRect().bottom<=navRect.top+1});
</script></body></html>`);
const chrome=process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe';
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'himoto-detail-qa-'));
async function main(){
 const browser=spawn(chrome,['--headless=new','--no-sandbox','--disable-backgrounding-occluded-windows','--disable-renderer-backgrounding','--disable-background-timer-throttling','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],{windowsHide:true,stdio:'ignore'});
 let socket;
 try{
  const portFile=path.join(profile,'DevToolsActivePort');
  for(let attempt=0;!fs.existsSync(portFile)&&attempt<100;attempt++)await new Promise(resolve=>setTimeout(resolve,100));
  const port=fs.readFileSync(portFile,'utf8').split('\n')[0];
  let target;for(let attempt=0;!target&&attempt<30;attempt++){try{target=await fetch(`http://127.0.0.1:${port}/json/new?about:blank`,{method:'PUT'}).then(response=>response.json());}catch{await new Promise(resolve=>setTimeout(resolve,100));}}
  assert(target,'Chrome debug target unavailable');
  socket=new (require('next/dist/compiled/ws'))(target.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
  let next=0;const pending=new Map();socket.addEventListener('message',event=>{const value=JSON.parse(event.data);if(value.id&&pending.has(value.id)){const {resolve,reject}=pending.get(value.id);pending.delete(value.id);value.error?reject(value.error):resolve(value.result);}});
  const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++next;const timeout=setTimeout(()=>reject(new Error('CDP timeout: '+method)),10000);pending.set(id,{resolve:value=>{clearTimeout(timeout);resolve(value);},reject:error=>{clearTimeout(timeout);reject(error);}});socket.send(JSON.stringify({id,method,params}));});

  for(const width of [320,393,600,1024]){
   await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:true});
   await send('Page.navigate',{url:`file:///${fixture.replaceAll('\\','/')}?width=${width}`});
   let metrics;
   for(let attempt=0;attempt<50;attempt++){
    await new Promise(resolve=>setTimeout(resolve,100));
    const result=await send('Runtime.evaluate',{expression:'document.querySelector("#qa")?.textContent',returnByValue:true});
    try{metrics=JSON.parse(result.result.value);}catch{}
    if(metrics?.width===width)break;
   }
   assert(metrics,'Missing layout metrics');assert.equal(metrics.columns,width<480?2:width<=768?3:2);assert.equal(metrics.overflow,false);assert.equal(metrics.fieldOverflow,false);
   assert.equal(metrics.navVisible,width<=768);if(width<=768){assert.equal(metrics.navButtons,3);assert(metrics.navAtBottom);assert(metrics.footerAboveNav);}
   if(width===393){
    const result=await send('Runtime.evaluate',{expression:`(()=>{const dialog=document.querySelector('dialog');const hit=()=>{const nav=dialog.querySelector('.mg-dialog-mobile-nav'),rect=nav.getBoundingClientRect();return !!document.elementFromPoint(rect.left+rect.width/2,rect.top+rect.height/2)?.closest('.mg-dialog-mobile-nav button');};const normal=hit();dialog.classList.add('mg-dialog-fullscreen');const fullscreen=hit()&&dialog.getBoundingClientRect().bottom<=dialog.querySelector('.mg-dialog-mobile-nav').getBoundingClientRect().top+1;dialog.classList.remove('mg-dialog-fullscreen');return {normal,fullscreen};})()`,returnByValue:true});
    assert(result.result.value.normal,'Modal navigation must receive taps');assert(result.result.value.fullscreen,'Fullscreen dialog must reserve space for navigation');
   }
   const screenshot=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(out,`vehicle-${width}.png`),Buffer.from(screenshot.data,'base64'));console.log(JSON.stringify(metrics));
  }
 }finally{socket?.close();browser.kill();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
