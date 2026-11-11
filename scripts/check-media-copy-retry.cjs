const assert=require('node:assert/strict');
const retry=require('./lib/media-copy-retry.cjs');
for(const error of [{name:'AbortError'},{name:'TimeoutError'},{code:'ECONNRESET'},{cause:{code:'UND_ERR_SOCKET'}},{cause:{code:'UND_ERR_CONNECT_TIMEOUT'}},{code:'40001'},{code:'40P01'},{$metadata:{httpStatusCode:429}},{$metadata:{httpStatusCode:503}},{message:'SOURCE_HTTP_502'}])assert(retry(error));
for(const error of [{message:'ARCHIVE_CONFLICT'},{message:'INVALID_SOURCE_VIDEO'},{message:'COPY_FAILED'},{message:'SOURCE_HTTP_404'},{message:'SOURCE_HTTP_403'},{$metadata:{httpStatusCode:409}},{$metadata:{httpStatusCode:412}},{code:'23505'},{name:'RecordPhotoError',status:413}])assert(!retry(error));
console.log(JSON.stringify({passed:true,checks:['temporary network/database/HTTP failures can retry immutable copy','conflicts, invalid bytes and permanent source errors never auto-retry'],externalNetwork:false}));
