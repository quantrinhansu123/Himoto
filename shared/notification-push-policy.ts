import {createHash} from 'node:crypto';
import type {MobileNotificationKind} from './mobile-notifications';
export function notificationPushPolicy(group:{kind:MobileNotificationKind;fingerprint:string;rows:{id:number}[]},previous:Record<string,string>,now=Date.now()){
  const memberKey=`${group.kind}:members`,sentKey=`${group.kind}:sentAt`;
  const members=group.rows.map(r=>createHash('sha256').update(String(r.id)).digest('hex').slice(0,16)).sort();
  let old:string[]|null=null;try{const parsed=JSON.parse(previous[memberKey]);if(Array.isArray(parsed)&&parsed.every(v=>typeof v==='string'))old=parsed;}catch{}
  const added=old===null||members.some(m=>!old!.includes(m));
  const last=Number(previous[sentKey]||0),throttled=['due','overdue'].includes(group.kind)&&last>0&&now-last<2*60*60*1000;
  return {members:JSON.stringify(members),memberKey,sentKey,added,throttled};
}
