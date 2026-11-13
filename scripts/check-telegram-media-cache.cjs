const assert=require('node:assert/strict'),path=require('node:path');
const {load,root}=require('./lib/load-typescript.cjs');
const media=load(path.join(root,'lib/server/telegram-delivery'));
const cache=load(path.join(root,'lib/server/telegram-media-cache'));
const objects=load(path.join(root,'lib/server/object-media'));
const videos=load(path.join(root,'lib/server/cloudfly-videos'));
const bot='a'.repeat(64),otherBot='b'.repeat(64),records=new Map();
const db={query:async(sql,args)=>{
  if(sql.startsWith('SELECT'))return {rows:args[1].flatMap(key=>{const found=records.get(`${args[0]}:${key}`);return found?[{media_key:key,...found}]:[];})};
  if(sql.startsWith('INSERT'))for(const row of JSON.parse(args[1]))records.set(`${args[0]}:${row.media_key}`,row);
  else if(sql.startsWith('DELETE'))for(const key of args[1])records.delete(`${args[0]}:${key}`);
  else throw Error('Unexpected cache SQL');
  return {rows:[]};
}};
async function main(){
  let sourceReads=0,nextId=0;
  const originals={read:objects.readObjectMedia,videoUrl:videos.objectVideoUrl,videoSize:videos.objectVideoByteLength};
  objects.readObjectMedia=async()=>{sourceReads++;return new Response(Buffer.from([255,216,255,1]));};
  videos.objectVideoByteLength=async()=>{sourceReads++;return 1024;};
  videos.objectVideoUrl=async()=>{sourceReads++;return 'https://qa.invalid/video';};
  try{
    const photo=index=>({slot:`rental-${index}`,mime_type:'image/jpeg',bytes:null,
      cloudinary_public_id:null,cloudinary_cloud_name:null,cloudinary_version:null,
      object_bucket:'qa-private',object_key:`photo-${index}`,object_etag:`etag-${index}`});
    const photos=[...Array.from({length:32},(_,index)=>photo(index+1)),{...photo(33),mime_type:'video/mp4'}];
    assert.equal(cache.telegramMediaKey({...photo(1)}),cache.telegramMediaKey(photo(1)));
    assert.notEqual(cache.telegramMediaKey({...photo(1),object_etag:'changed'}),cache.telegramMediaKey(photo(1)));
    assert.notEqual(cache.telegramMediaKey({...photo(1),mime_type:'video/mp4'}),cache.telegramMediaKey(photo(1)));
    assert.equal(cache.telegramMediaKey({...photo(1),object_etag:null}),null);
    const batches=async prepared=>{const result=[];for await(const batch of media.telegramMediaBatches(prepared,0,Date.now()+240000))result.push(batch);return result;};
    const cold=await batches(await cache.cachedTelegramMedia(db,bot,photos));
    assert.equal(sourceReads,34);assert.deepEqual(cold.map(batch=>batch.length),[10,10,10,2,1]);
    assert(cold.flat().filter(file=>file.type!=='video/mp4').every(file=>file.data&&!file.url));
    for(const batch of cold){
      const receipts=[];
      const send=async()=>Response.json({ok:true,result:batch.length===1
        ?{message_id:++nextId,video:{file_id:'cached-video'}}
        :batch.map((_,index)=>({message_id:++nextId,photo:[
          {file_id:`small-${nextId}`,width:10,height:10},
          {file_id:`large-${nextId}-${index}`,width:1000,height:1000}]}))});
      await media.telegramCall('qa-only',batch.length===1?'sendVideo':'sendMediaGroup',{},send,batch.length,receipts);
      if(batch.length>1)assert(receipts.every(receipt=>receipt.kind==='photo'&&receipt.file_id.startsWith('large-')));
      await cache.rememberTelegramMedia(db,bot,batch,receipts);
    }
    assert.equal(records.size,33);
    sourceReads=0;
    const warm=await batches(await cache.cachedTelegramMedia(db,bot,photos));
    assert.equal(sourceReads,0);assert(warm.flat().every(file=>file.file_id&&!file.url&&!file.data));
    const foreign=await cache.cachedTelegramMedia(db,otherBot,photos);assert(foreign.every(photo=>!photo.telegram_file_id));
    const changed=await cache.cachedTelegramMedia(db,bot,[{...photo(1),object_etag:'changed'}]);assert(!changed[0].telegram_file_id);
    const receipts=[];
    await assert.rejects(()=>media.telegramCall('qa-only','sendMediaGroup',{},async()=>Response.json({ok:true,result:[{message_id:1}]}),2,receipts));
    assert.equal(receipts.length,0,'Malformed acknowledgements cannot populate the cache');
    assert(media.canReplaceRejectedTelegramFile(new media.TelegramDeliveryError('TELEGRAM_400',true,'wrong file identifier/HTTP URL specified')));
    assert(!media.canReplaceRejectedTelegramFile(new media.TelegramDeliveryError('TELEGRAM_TIMEOUT',false)));
    assert(!media.canReplaceRejectedTelegramFile(new media.TelegramDeliveryError('TELEGRAM_400',true,'chat not found')));
    await cache.forgetTelegramMedia(db,bot,warm[0]);assert.equal(records.size,23);
    const refresh=await cache.cachedTelegramMedia(db,bot,photos);assert(refresh.slice(0,10).every(photo=>!photo.telegram_file_id));
    assert(refresh.slice(10).every(photo=>photo.telegram_file_id));
    console.log(JSON.stringify({passed:5,checks:[
      'Exact immutable media version, MIME and bot isolate cached Telegram file IDs',
      'A 32-photo/1-video reuse avoids all 34 media source preparations while preserving 10/10/10/2/1 batches',
      'Only complete valid Telegram acknowledgements cache files; the largest accepted photo is reused',
      'A confirmed stale file ID can fall back; timeout and unrelated API errors cannot trigger a replay',
      'Eviction affects only the rejected cached files of the selected bot'
    ],realTelegramRequests:0,externalMediaRequests:0},null,2));
  }finally{objects.readObjectMedia=originals.read;videos.objectVideoUrl=originals.videoUrl;videos.objectVideoByteLength=originals.videoSize;}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
