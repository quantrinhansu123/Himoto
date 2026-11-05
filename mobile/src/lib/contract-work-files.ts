import {Directory,File,Paths} from 'expo-file-system';
import {uuid} from 'expo';
import {isContractWorkScope,isContractWorkPhoto,sameWorkScope,ContractWorkRuleError,isWorkDigest,isWorkUuid,type ContractWorkScope,type ContractWorkPhoto} from '../../../shared/mobile-contract-work';
import {createContractWorkJournal,contractWorkPhotoPath,ContractWorkStorageError,type ContractWorkFiles} from './contract-work-journal';
import type {RecordMediaPhoto} from './record-media-photo';

const ownedRoot=()=>new Directory(Paths.document,'himoto-contract-work-v1');
const validPath=(path:string)=>path===''||new RegExp('^[0-9a-f-]{36}(?:/(?:photos|generations)(?:/(?:[0-9a-f-]{36}|[0-9a-f-]{36}\\.jpg)(?:/(?:state|seal)\\.json)?)?)?$').test(path)&&path.split('/').filter(p=>/^[0-9a-f-]{36}(?:\.jpg)?$/.test(p)).every(p=>isWorkUuid(p.replace(/\.jpg$/,'')));
function failure():never{throw new ContractWorkStorageError();}

/** Native-only adapter. Never initialized by the current form until the recovery UI is integrated. */
export async function openNativeContractWorkStore(scope:ContractWorkScope){
  if(!isContractWorkScope(scope))failure();
  const actor={...scope},root=ownedRoot();root.create({intermediates:true,idempotent:true});
  // Hash only the canonical origin/actor header. This temporary file has no form, photo, token or session data.
  const temporary=new File(root,`scope-${uuid.v4().toLowerCase()}.tmp`);
  let actorKey:string;
  try{
    temporary.create({overwrite:false});await temporary.write(JSON.stringify({origin:actor.origin,userId:actor.userId}));
    actorKey=await temporary.digest('SHA-256');if(!isWorkDigest(actorKey))failure();
  }finally{try{if(temporary.exists)temporary.delete();}catch{/* Only this just-created owned header may be cleaned here. */}}
  const directory=new Directory(root,actorKey);directory.create({intermediates:true,idempotent:true});
  function checked(path:string){if(!validPath(path))failure();return path?path.split('/'):[];}
  const dir=(path:string)=>new Directory(directory,...checked(path));
  const file=(path:string)=>{const parts=checked(path);if(!parts.length)failure();return new File(directory,...parts);};
  const files:ContractWorkFiles={
    lockKey:directory.uri,
    async list(path){return dir(path).list().map(item=>({name:item.name,directory:item instanceof Directory}));},
    async mkdir(path){dir(path).create({intermediates:true,idempotent:true});},
    async read(path,maxBytes){const item=file(path);if(!item.exists||item.size>maxBytes)failure();return item.text();},
    async writeNew(path,text){const item=file(path);item.create({overwrite:false});await item.write(text);},
    async digest(path){const item=file(path);if(!item.exists)failure();return item.digest('SHA-256');},
    async photoSize(path){const item=file(path);if(!item.exists)failure();return item.size;},
  };
  const journal=createContractWorkJournal(files,actor,()=>uuid.v4().toLowerCase());
  return {
    ...journal,
    /** Copy the app-created prepared JPEG; dispose of cache only after the caller commits the photo association. */
    async importPreparedPhoto(workId:string,photoId:string,slot:string,source:RecordMediaPhoto):Promise<ContractWorkPhoto>{
      if(!isWorkUuid(workId)||!isWorkUuid(photoId)||source.mimeType!=='image/jpeg'||!Number.isSafeInteger(source.size)||source.size<=0||source.size>2*1024*1024)failure();
      const cache=new URL(Paths.cache.uri).href.replace(/\/?$/,'/'),uri=new URL(source.uri).href;
      if(!uri.startsWith(cache)||!uri.startsWith('file:')||uri.includes('?')||uri.includes('#'))failure();
      // Establish the work belongs to this actor before creating a file; do not accept arbitrary source/gallery URLs.
      const head=await journal.load(workId);
      if(!sameWorkScope(head.work.scope,actor)||head.work.status!=='open'||head.work.attempts.some(a=>a.state==='planned'||!a.acknowledged||a.kind==='copy'&&a.state==='committed'))throw new ContractWorkRuleError('Giữ bản gốc và đối chiếu trước khi chọn thêm ảnh.');
      const destination=file(contractWorkPhotoPath(workId,photoId)),original=new File(uri);
      if(destination.exists||original.size!==source.size)failure();
      await original.copy(destination,{overwrite:false});
      const bytes=destination.size,sha256=await destination.digest('SHA-256');
      const header=new Uint8Array(await destination.arrayBuffer());if(header[0]!==255||header[1]!==216||header[2]!==255)failure();
      const photo:ContractWorkPhoto={id:photoId,fileId:photoId,slot,sha256,bytes,width:source.width,height:source.height,mimeType:'image/jpeg',discarded:false};
      if(bytes!==source.size||sha256!==await original.digest('SHA-256')||!isContractWorkPhoto(photo))failure();
      return photo;
    },
    /** Recover a committed local association after a readback failure; never overwrite, recopy or adopt a different image. */
    async recoverPreparedPhoto(workId:string,photoId:string,slot:string,source:RecordMediaPhoto):Promise<ContractWorkPhoto>{
      if(!isWorkUuid(workId)||!isWorkUuid(photoId))failure();
      const head=await journal.load(workId),photo=head.work.photos.find(p=>p.id===photoId&&!p.discarded);
      if(head.work.status!=='open'||!photo||photo.slot!==slot||photo.mimeType!==source.mimeType||photo.bytes!==source.size||photo.width!==source.width||photo.height!==source.height)failure();
      const cache=new URL(Paths.cache.uri).href.replace(/\/?$/,'/'),uri=new URL(source.uri).href;
      if(!uri.startsWith(cache)||!uri.startsWith('file:')||uri.includes('?')||uri.includes('#'))failure();
      const original=new File(uri);
      if(!original.exists||original.size!==photo.bytes||await original.digest('SHA-256')!==photo.sha256)failure();
      return photo;
    },
    /** Resume reads only checked owned paths and verifies bytes/digest before exposing the URI or request body. */
    async readPhoto(workId:string,photoId:string):Promise<RecordMediaPhoto>{
      const head=await journal.load(workId),photo=head.work.photos.find(p=>p.id===photoId&&!p.discarded);if(!photo)failure();
      const item=file(contractWorkPhotoPath(workId,photo.fileId));
      const verify=async()=>{if(!item.exists||item.size!==photo.bytes||await item.digest('SHA-256')!==photo.sha256)failure();};
      await verify();
      return {uri:item.uri,width:photo.width,height:photo.height,size:photo.bytes,mimeType:'image/jpeg',dispose:()=>{/* Views do not own durable files. */},bytes:async()=>{await verify();const bytes=await item.arrayBuffer();if(bytes.byteLength!==photo.bytes)failure();await verify();return bytes;}};
    },
  };
}
