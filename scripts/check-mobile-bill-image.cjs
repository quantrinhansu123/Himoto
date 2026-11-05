const assert=require('node:assert/strict'),fs=require('node:fs'),sharp=require('sharp');
async function run(){
  const data=fs.readFileSync(process.argv[2]);assert(data.length>0&&data.length<=2097152);
  const image=sharp(data),meta=await image.metadata();
  assert.equal(meta.format,'jpeg');assert.equal(Math.max(meta.width,meta.height),2200);assert(Math.min(meta.width,meta.height)>1000);
  // Decode all pixels as well as the header so truncated/invalid images cannot pass.
  const pixels=await image.raw().toBuffer();assert.equal(pixels.length,meta.width*meta.height*meta.channels);
  console.log(JSON.stringify({format:meta.format,width:meta.width,height:meta.height,bytes:data.length,decodedBytes:pixels.length}));
}
run().catch(error=>{console.error(error);process.exitCode=1;});
