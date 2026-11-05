import {
  createContractWork,changeContractWork,ContractWorkRuleError,isContractWork,isContractWorkScope,isWorkUuid,isWorkDigest,sameWorkActor,
  type ContractWork,type ContractWorkScope,type ContractWorkCommand,
} from '../../../shared/mobile-contract-work';
import type {MobileDraftInput} from '../../../shared/mobile-contract';

/** All paths are relative to one actor's owned directory. No raw URI is persisted. */
export interface ContractWorkFiles {
  lockKey:string;
  list(path:string):Promise<{name:string;directory:boolean}[]>;
  mkdir(path:string):Promise<void>;
  read(path:string,maxBytes:number):Promise<string>;
  writeNew(path:string,text:string):Promise<void>;
  digest(path:string):Promise<string>;
  photoSize(path:string):Promise<number>;
}
export interface ContractWorkHead {commitId:string;generation:number;work:ContractWork}
interface Payload {schema:1;commitId:string;parent:string|null;generation:number;work:ContractWork}
interface Seal {schema:1;commitId:string;parent:string|null;generation:number;sha256:string}
const MAX_MANIFEST_BYTES=4*1024*1024;
const utf8Bytes=(value:string)=>{let bytes=0;for(const character of value){const point=character.codePointAt(0)!;bytes+=point<0x80?1:point<0x800?2:point<0x10000?3:4;}return bytes;};
const locks=new Map<string,Promise<unknown>>();
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const exact=(v:Record<string,unknown>,keys:readonly string[])=>Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
function fail():never{throw new ContractWorkStorageError();}
export class ContractWorkStorageError extends Error {
  constructor(){super('Không đọc hoặc ghi được bản đang soạn trên thiết bị. Dữ liệu trước được giữ; chưa được gửi tiếp.');this.name='ContractWorkStorageError';}
}
function serialized<T>(key:string,task:()=>Promise<T>):Promise<T>{
  const result=(locks.get(key)??Promise.resolve()).then(task);locks.set(key,result.catch(()=>{}));return result;
}
export const contractWorkPhotoPath=(workId:string,fileId:string)=>{
  if(!isWorkUuid(workId)||!isWorkUuid(fileId))return fail();return `${workId}/photos/${fileId}.jpg`;
};
function validPayload(v:unknown,scope:ContractWorkScope,workId:string,commitId:string):v is Payload {
  return object(v)&&exact(v,['schema','commitId','parent','generation','work'])&&v.schema===1&&v.commitId===commitId&&(v.parent===null||isWorkUuid(v.parent))&&Number.isSafeInteger(v.generation)&&Number(v.generation)>0&&isContractWork(v.work)&&v.work.id===workId&&sameWorkActor(v.work.scope,scope);
}
function validSeal(v:unknown,commitId:string):v is Seal {
  return object(v)&&exact(v,['schema','commitId','parent','generation','sha256'])&&v.schema===1&&v.commitId===commitId&&(v.parent===null||isWorkUuid(v.parent))&&Number.isSafeInteger(v.generation)&&Number(v.generation)>0&&isWorkDigest(v.sha256);
}
/** Append-only generations. An incomplete or forked head blocks writes; never silently load an older generation. */
export function createContractWorkJournal(files:ContractWorkFiles,scope:ContractWorkScope,makeUuid:()=>string,clock:()=>number=Date.now){
  if(!isContractWorkScope(scope))fail();
  // Capture the owner: a caller cannot change this instance to another actor during an async write.
  const owner={...scope};
  async function names(path:string){
    const entries=await files.list(path);
    if(entries.some(e=>!isWorkUuid(e.name)||!e.directory)||new Set(entries.map(e=>e.name)).size!==entries.length)fail();
    return entries.map(e=>e.name);
  }
  async function verifyPhotos(work:ContractWork){
    if(work.status==='open')for(const photo of work.photos.filter(p=>!p.discarded)){
      const path=contractWorkPhotoPath(work.id,photo.fileId);
      if(await files.photoSize(path)!==photo.bytes||await files.digest(path)!==photo.sha256)fail();
    }
  }
  async function loadUnlocked(workId:string):Promise<ContractWorkHead>{
    if(!isWorkUuid(workId))fail();
    const commits=await names(`${workId}/generations`);if(!commits.length)fail();
    const all:Payload[]=[];
    for(const commitId of commits){
      const path=`${workId}/generations/${commitId}`;
      const children=await files.list(path);
      if(children.length!==2||children.some(e=>e.directory)||!children.some(e=>e.name==='state.json')||!children.some(e=>e.name==='seal.json'))fail();
      const seal:unknown=JSON.parse(await files.read(`${path}/seal.json`,1024));if(!validSeal(seal,commitId))fail();
      if(await files.digest(`${path}/state.json`)!==seal.sha256)fail();
      const payload:unknown=JSON.parse(await files.read(`${path}/state.json`,MAX_MANIFEST_BYTES));
      if(!validPayload(payload,owner,workId,commitId)||payload.generation!==seal.generation||payload.parent!==seal.parent)fail();
      all.push(payload);
    }
    all.sort((a,b)=>a.generation-b.generation);
    for(let i=0;i<all.length;i++){
      if(all[i].generation!==i+1||all[i].parent!==(i===0?null:all[i-1].commitId))fail();
      // Historical scope, original target and work identity never migrate with current grants.
      if(i&&JSON.stringify(all[i].work.scope)!==JSON.stringify(all[0].work.scope)||all[i].work.baseDraftId!==all[0].work.baseDraftId||all[i].work.createdAt!==all[0].work.createdAt)fail();
    }
    const head=all[all.length-1];
    // Only current, unfinished files need to remain available. Old generations are retained as evidence.
    await verifyPhotos(head.work);
    return {commitId:head.commitId,generation:head.generation,work:head.work};
  }
  async function publish(work:ContractWork,parent:ContractWorkHead|null){
    if(!isContractWork(work)||!sameWorkActor(work.scope,owner))fail();
    await verifyPhotos(work);
    const commitId=makeUuid();if(!isWorkUuid(commitId)||commitId===parent?.commitId)fail();
    const generation=(parent?.generation??0)+1,path=`${work.id}/generations/${commitId}`;
    const payload:Payload={schema:1,commitId,parent:parent?.commitId??null,generation,work};
    const text=JSON.stringify(payload);if(utf8Bytes(text)>MAX_MANIFEST_BYTES)fail();
    // Never overwrite, rename over, or delete the last valid generation on either platform.
    await files.mkdir(path);
    await files.writeNew(`${path}/state.json`,text);
    const sha256=await files.digest(`${path}/state.json`);if(!isWorkDigest(sha256)||await files.read(`${path}/state.json`,MAX_MANIFEST_BYTES)!==text)fail();
    const seal:Seal={schema:1,commitId,parent:payload.parent,generation,sha256};
    await files.writeNew(`${path}/seal.json`,JSON.stringify(seal));
    // Cold-read the entire chain (including the seal) before an HTTP reservation may use this state.
    const verified=await loadUnlocked(work.id);
    if(verified.commitId!==commitId||JSON.stringify(verified.work)!==JSON.stringify(work))fail();
    return verified;
  }
  async function guarded<T>(task:()=>Promise<T>):Promise<T>{
    try{return await serialized(files.lockKey,task);}catch(error){if(error instanceof ContractWorkStorageError||error instanceof ContractWorkRuleError)throw error;throw new ContractWorkStorageError();}
  }
  return {
    async list():Promise<ContractWorkHead[]>{return guarded(async()=>{const ids=await names('');const result:ContractWorkHead[]=[];for(const id of ids)result.push(await loadUnlocked(id));return result;});},
    async load(workId:string){return guarded(()=>loadUnlocked(workId));},
    async create(workId:string,input:MobileDraftInput,baseDraftId:number|null){
      return guarded(async()=>{
        const work=createContractWork(owner,workId,input,baseDraftId,clock());
        // Reserve enough space for the fixed UUID/sequence envelope before creating an owned work directory.
        if(utf8Bytes(JSON.stringify(work))>MAX_MANIFEST_BYTES-512)fail();
        if((await names('')).includes(workId))fail();
        await files.mkdir(`${workId}/generations`);await files.mkdir(`${workId}/photos`);
        return publish(work,null);
      });
    },
    async change(head:ContractWorkHead,currentScope:ContractWorkScope,command:ContractWorkCommand){
      return guarded(async()=>{
        const latest=await loadUnlocked(head.work.id);
        if(latest.commitId!==head.commitId)throw new ContractWorkRuleError('Bản đang soạn đã thay đổi. Mở lại dữ liệu mới nhất trước khi tiếp tục.');
        if(command.type==='plan-metadata'||command.type==='plan-photo'||command.type==='plan-copy'){
          for(const workId of await names(''))if(workId!==head.work.id){
            const other=await loadUnlocked(workId);
            if(other.work.attempts.some(a=>a.key===command.key))throw new ContractWorkRuleError('Mã yêu cầu đã thuộc bản đang soạn khác. Giữ đúng bản gốc để đối chiếu.');
          }
        }
        const work=changeContractWork(latest.work,currentScope,command,clock());
        return publish(work,latest);
      });
    },
  };
}
