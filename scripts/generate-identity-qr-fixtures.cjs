// Synthetic data only. Local ZXing writer is used solely to generate QR test images.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const writer=require('zxing-wasm/writer');
writer.prepareZXingModule({overrides:{wasmBinary:fs.readFileSync(require.resolve('zxing-wasm/writer/zxing_writer.wasm'))}});
async function run(){
 const out=path.resolve(process.argv[2]);assert(out.startsWith(path.resolve('.backups')+path.sep));fs.mkdirSync(out,{recursive:true});
 for(const [name,value] of Object.entries({first:'001200000001|123456789|NGUYỄN VĂN QA|01011990|Nam|Hà Nội|05062022',second:'001200000002||TRẦN VĂN QA|02021991|Nam|Hà Nội|07082023',invalid:'not-an-identity-qr'})){
  const result=await writer.writeBarcode(value,{format:'QRCode',scale:6});assert(!result.error&&result.image);
  fs.writeFileSync(path.join(out,name+'.png'),Buffer.from(await result.image.arrayBuffer()));
 }
}
run().catch(error=>{console.error(error);process.exitCode=1});
