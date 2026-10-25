import type { PhotoSlot } from './record-photos';

const extraSuffix=/-extra-([2-9]|[1-9]\d{1,14})$/;
/** Supplemental images inherit the original field's meaning and authorization. */
export function photoBaseSlot(slot:string){return slot.replace(extraSuffix,'');}
export function isSupplementalPhotoSlot(slot:string){const base=photoBaseSlot(slot);return base!==slot&&!base.includes('-extra-')&&!base.includes('-video-');}
export function nextPhotoInGroup(slot:string,keys:string[]){
  const base=photoBaseSlot(slot);
  if(!keys.includes(base))return base;
  let n=2;while(keys.includes(`${base}-extra-${n}`))n++;
  return `${base}-extra-${n}`;
}
export function expandPhotoGroups(slots:readonly PhotoSlot[],keys:string[]):PhotoSlot[]{
  return slots.flatMap(slot=>[slot,...Array.from(new Set(keys)).filter(key=>isSupplementalPhotoSlot(key)&&photoBaseSlot(key)===slot.key&&!slots.some(existing=>existing.key===key))
    .sort((a,b)=>a.localeCompare(b,'en',{numeric:true})).map(key=>({key,label:`${slot.label} · Ảnh ${key.split('-').at(-1)}`}))]);
}
