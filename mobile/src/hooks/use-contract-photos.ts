import {useEffect,useRef,useState} from 'react';
import {uuid} from 'expo';
import type {MobileDraftVehicle} from '@himoto/mobile-contract';
import {useSession} from '@/providers/session';
import {selectRecordMediaPhoto,type RecordMediaPhoto} from '@/lib/record-media-photo';
import {nextPhotoInGroup,photoBaseSlot} from '../../../shared/photo-slot-groups';
import {nextSignedContractPhotoSlot} from '../../../shared/contract-photos';
import type {DraftWorkController,WorkLocalPhoto} from '@/lib/draft-work-controller';
import {prepareDraftWorkTransition} from '@/lib/draft-work-transition';
import {plateKey} from '../../../shared/mobile-plate-ocr';
export interface ContractPendingPhoto {id:string;slot:string;photo:RecordMediaPhoto;savedTo?:number;durable?:boolean}
export function useContractPhotos({getVehicleIds,onVehicle,work=null,initialPhotos=[]}:{work?:DraftWorkController|null;initialPhotos?:WorkLocalPhoto[];getVehicleIds:()=>string[];onVehicle:(vehicle:MobileDraftVehicle,before:string[],scan:boolean)=>void}) {
  const {api,session}=useSession();
  const [photos,setPhotos]=useState<ContractPendingPhoto[]>(initialPhotos),[picking,setPicking]=useState(false),[reading,setReading]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const persisting=useRef<Promise<void>|null>(null);
  const current=useRef<ContractPendingPhoto[]>(initialPhotos),get=useRef(getVehicleIds),apply=useRef(onVehicle),alive=useRef(true),token=useRef(session?.token),busy=useRef(false),epoch=useRef(0),picker=useRef<AbortController|null>(null),reader=useRef<AbortController|null>(null);
  useEffect(()=>{get.current=getVehicleIds;apply.current=onVehicle;token.current=session?.token;},[getVehicleIds,onVehicle,session?.token]);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;picker.current?.abort();reader.current?.abort();current.current.filter(r=>!work||r.durable).forEach(r=>r.photo.dispose());};},[work]);
  function replace(rows:ContractPendingPhoto[]){current.current=rows;setPhotos(rows);}
  function skip(){epoch.current++;reader.current?.abort();reader.current=null;setReading(false);setNotice('Đã bỏ qua AI. Ảnh được giữ để rà soát và gắn vào đúng xe bằng tay.');}
  async function read(row:ContractPendingPhoto){
    if(!api||!session||!session.user.permissions.includes('customers.write'))return;
    reader.current?.abort();const controller=new AbortController();reader.current=controller;const at=++epoch.current,atToken=session.token,before=[...get.current()];
    setReading(true);setError('');setNotice('Đang đọc và đối chiếu biển số với kho xe.');
    try{
      const result=await api.plateOcr(await row.photo.bytes(),uuid.v4().toLowerCase(),controller.signal),license=result.fields.license||'';
      if(controller.signal.aborted||!alive.current||token.current!==atToken||at!==epoch.current)return;
      if(!plateKey(license))throw Error('Chưa đọc được biển số. Giữ ảnh và chọn xe bằng tay.');
      const match=await api.plateLookup(license,controller.signal);
      if(controller.signal.aborted||!alive.current||token.current!==atToken||at!==epoch.current)return;
      if(match.match!=='unique'||!match.vehicle)throw Error(`Đọc được biển số ${license}, ${match.match==='ambiguous'?'có nhiều xe trùng biển số':'chưa tìm thấy xe trong kho'}. Kiểm tra và chọn xe thủ công.`);
      const base=photoBaseSlot(row.slot),vehicle=match.vehicle.vehicle;
      if(base!=='scan_plate'&&base!==`plate-${vehicle.id}`)throw Error(`Ảnh có biển số ${license}, không khớp xe đang chọn. Kiểm tra lại ảnh.`);
      apply.current(vehicle,before,base==='scan_plate');
      if(base==='scan_plate'){
        const next=current.current.filter(p=>photoBaseSlot(p.slot)!=='scan_plate');
        for(const pending of current.current.filter(p=>photoBaseSlot(p.slot)==='scan_plate'))next.push({...pending,slot:nextPhotoInGroup(`plate-${vehicle.id}`,next.map(p=>p.slot))});
        if(work)for(const pending of next.filter(p=>current.current.some(old=>old.id===p.id&&old.slot!==p.slot)))await work.bindPhoto(pending.id,pending.slot);
        if(controller.signal.aborted||!alive.current||token.current!==atToken||at!==epoch.current)return;
        replace(next);
      }
      setNotice(`Đã đọc biển số ${vehicle.license} và đối chiếu xe ${vehicle.name}. ${result.warnings.join(' ')}`);
    }catch(cause){if(alive.current&&!controller.signal.aborted&&token.current===atToken&&at===epoch.current){setError((cause as Error).message);setNotice('Ảnh được giữ. Đọc lại hoặc rà soát và chọn xe bằng tay.');}}
    finally{if(alive.current&&at===epoch.current)setReading(false);}
  }
  async function pick(base:string,camera=false){
    if(busy.current)return;busy.current=true;setPicking(true);setError('');reader.current?.abort();epoch.current++;setReading(false);
    const controller=new AbortController();picker.current=controller;const at=token.current;
    try{
      await prepareTransition();
      if(controller.signal.aborted||!alive.current||at!==token.current)return;
      const photo=await selectRecordMediaPhoto(camera,controller.signal);if(!photo)return;
      if(!alive.current||at!==token.current){photo.dispose();return;}
      const keys=current.current.map(p=>p.slot),slot=base==='rental-document-1'?nextSignedContractPhotoSlot(keys):nextPhotoInGroup(base,keys);let row:ContractPendingPhoto={id:uuid.v4().toLowerCase(),slot,photo};
      replace([...current.current,row]);
      await ensurePersistent();
      if(!alive.current||at!==token.current)return;row=current.current.find(p=>p.id===row.id)??row;
      if(base==='scan_plate'||base.startsWith('plate-'))void read(row);
    }catch(cause){if(alive.current&&!controller.signal.aborted&&at===token.current)setError((cause as Error).message);}
    finally{busy.current=false;if(alive.current)setPicking(false);}
  }
  async function ensurePersistent(){
    if(!work)return;if(persisting.current)return persisting.current;
    const at=token.current,check=()=>{if(!alive.current||at!==token.current)throw Error('Phiên hoặc bản đang soạn đã thay đổi. Ảnh gốc được giữ.');};
    const task=(async()=>{
      check();let row:ContractPendingPhoto|undefined;
      while((row=current.current.find(p=>!p.durable))){check();const held=await work.importPhoto(row);check();const next=current.current.map(p=>p.id===held.id?held:p);current.current=next;setPhotos(next);}
    })();
    persisting.current=task;try{await task;}finally{if(persisting.current===task)persisting.current=null;}
  }
  async function prepareTransition(){
    if(!work)return;const at=token.current;
    await prepareDraftWorkTransition({isCurrent:()=>alive.current&&at===token.current,ensurePhotos:ensurePersistent,flush:()=>work.flush(),hasChanges:()=>work.hasLocalChanges()});
  }
  async function bind(id:string,vehicleId:string){skip();const old=current.current.find(p=>p.id===id);if(!old)return;const remaining=current.current.filter(p=>p.id!==id),slot=nextPhotoInGroup(`plate-${vehicleId}`,remaining.map(p=>p.slot));
    const at=token.current;setPicking(true);
    try{await ensurePersistent();if(work)await work.bindPhoto(id,slot);if(!alive.current||at!==token.current)return;replace(current.current.map(p=>p.id===id?{...p,slot}:p));setError('');setNotice('Đã gắn ảnh vào xe đã chọn. Kiểm tra lại ảnh và biển số trước khi lưu.');}
    catch(cause){if(alive.current)setError((cause as Error).message);}finally{if(alive.current)setPicking(false);}}
  async function remove(id:string){skip();const old=current.current.find(p=>p.id===id),at=token.current;setPicking(true);
    try{if(work&&old?.durable)await work.removePhoto(id);if(!alive.current||at!==token.current)return;replace(current.current.filter(p=>p.id!==id));old?.photo.dispose();setError('');setNotice('Đã bỏ ảnh khỏi bản nháp. Ảnh gốc trên thiết bị được giữ.');}
    catch(cause){if(alive.current)setError((cause as Error).message);}finally{if(alive.current)setPicking(false);}}
  async function clear(){skip();if(work)await work.discardUnsentPhotos();const old=current.current;replace([]);old.forEach(p=>p.photo.dispose());setError('');setNotice('');}
  function markSaved(id:string,contractId:number){replace(current.current.map(p=>p.id===id?{...p,savedTo:contractId}:p));}
  return {work,photos,ensurePersistent,prepareTransition,getPhotos:()=>current.current,picking,reading,error,notice,pick,read,skip,bind,remove,clear,markSaved};
}
