const assert=require('node:assert/strict'),path=require('node:path'),sharp=require('sharp'),{createHash}=require('node:crypto');
const {load,root}=require('./lib/load-typescript.cjs');
const delivery=load(path.join(root,'lib/server/telegram-delivery'));
const objects=load(path.join(root,'lib/server/object-media'));

async function main(){
  const original={read:objects.readObjectMedia,fetch:global.fetch,now:Date.now};
  global.fetch=async()=>{throw Error('External network disabled');};
  const checks=[];
  try{
    const raw=Buffer.alloc(1800*1350*3);let seed=23;
    for(let i=0;i<raw.length;i++){seed=(Math.imul(seed,1664525)+1013904223)|0;raw[i]=seed>>>24;}
    const jpeg=await sharp(raw,{raw:{width:1800,height:1350,channels:3}}).jpeg({quality:86}).toBuffer();
    assert(jpeg.length>512*1024&&jpeg.length<=2097152);
    const hash=createHash('sha256').update(jpeg).digest('hex');
    let reads=0;
    objects.readObjectMedia=async()=>{reads++;return new Response(jpeg);};
    const photo=i=>({slot:`rental-${i}`,mime_type:'image/jpeg',object_bucket:'fixture',object_key:`photo-${i}`,object_etag:`etag-${i}`,telegram_cache_key:`source-${i}`});
    const batches=async(photos,deadline=Date.now()+240000)=>{const result=[];for await(const batch of delivery.telegramMediaBatches(photos,0,deadline))result.push(batch);return result;};
    const prepared=await batches([photo(1),{...photo(2),slot:'driver-license'}]);
    assert.equal(reads,2);const [vehicle,document]=prepared.flat();
    assert(vehicle.data&&document.data&&!vehicle.url&&!document.url);
    assert.equal(vehicle.source_bytes,jpeg.length);assert(vehicle.data.length<jpeg.length);
    const dimensions=await sharp(vehicle.data).metadata(),paper=await sharp(document.data).metadata();
    assert.equal(dimensions.width,1600);assert.equal(paper.width,1800);assert.equal(paper.height,1350);
    assert.equal(createHash('sha256').update(jpeg).digest('hex'),hash);
    checks.push('New photos upload a smaller JPEG, preserve original bytes, and retain document resolution');

    const albums=await batches(Array.from({length:20},(_,i)=>photo(i+1)));
    assert.equal(albums.flat().length,20);assert(albums.length>1);
    assert.deepEqual(albums.flat().map(file=>file.cache_key),Array.from({length:20},(_,i)=>`source-${i+1}`));
    assert(albums.every(batch=>batch.length<=10&&batch.reduce((n,file)=>n+file.data.length,0)<=delivery.TELEGRAM_ALBUM_BYTES));
    checks.push('All twenty photos remain in order and every multipart album respects the byte and file limits');

    const before=reads,warm=await batches(Array.from({length:20},(_,i)=>({...photo(i+1),telegram_file_id:`cached-${i+1}`})));
    assert.equal(reads,before);assert.deepEqual(warm.map(b=>b.length),[10,10]);
    assert.deepEqual(warm.flat().map(file=>file.file_id),Array.from({length:20},(_,i)=>`cached-${i+1}`));
    checks.push('Acknowledged Telegram IDs bypass source reads and JPEG work without changing ordering');

    let attempts=0;
    objects.readObjectMedia=async()=>{if(++attempts===1)throw Error('Synthetic GET interruption');return new Response(Buffer.from([255,216,255,1]));};
    assert.equal((await batches([photo(1)])).flat().length,1);assert.equal(attempts,2);
    objects.readObjectMedia=async()=>{attempts++;throw Error('Synthetic unavailable source');};attempts=0;
    await assert.rejects(()=>batches([photo(1)]),error=>error.message==='MEDIA_FETCH_FAILED'&&error.definiteFailure);
    assert.equal(attempts,2);
    checks.push('An idempotent source GET retries once; an unavailable source fails before any Telegram POST');

    let clock=original.now(),slowReads=0;Date.now=()=>clock;
    objects.readObjectMedia=async()=>{if(slowReads++%3===0)clock+=50000;return new Response(Buffer.from([255,216,255,1]));};
    const iterator=delivery.telegramMediaBatches(Array.from({length:20},(_,i)=>photo(i+1)),0,clock+240000);
    const checkpoint=await iterator.next();assert(!checkpoint.done);assert.equal(checkpoint.value.length,3);
    delivery.requireTelegramTime(clock+190000,120000);
    await assert.rejects(()=>iterator.next(),delivery.TelegramContinuation);
    Date.now=original.now;
    checks.push('Slow preparation yields its ready partial album before continuation instead of starting that work over forever');

    let posts=0;
    await assert.rejects(()=>delivery.telegramCall('fixture-only','sendMediaGroup',{},async()=>{posts++;return Response.json({ok:false,error_code:429,description:'Too Many Requests',parameters:{retry_after:37}});}),error=>error.definiteFailure&&error.retryAfterSeconds===37&&error.method==='sendMediaGroup');
    assert.equal(posts,1);
    await assert.rejects(()=>delivery.telegramCall('fixture-only','sendPhoto',{},async()=>{posts++;const error=Error('Synthetic timeout');error.name='TimeoutError';throw error;}),error=>!error.definiteFailure&&error.message==='TELEGRAM_TIMEOUT');
    assert.equal(posts,2);
    checks.push('Flood rejections retain Telegram retry_after while a lost POST is never retried inside the transport');
    console.log(JSON.stringify({passed:checks.length,checks,realTelegramRequests:0,externalMediaRequests:0,operationalWrites:0},null,2));
  }finally{objects.readObjectMedia=original.read;global.fetch=original.fetch;Date.now=original.now;}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
