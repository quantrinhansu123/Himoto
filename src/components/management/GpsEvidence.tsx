import { formatDateTime } from '@/lib/formatters';
export function GpsEvidence({syncedAt,heartbeatAt,positionAt,compact=false}:{syncedAt?:string|null;heartbeatAt?:string|null;positionAt?:string|null;compact?:boolean}) {
  if(!syncedAt&&!heartbeatAt&&!positionAt)return null;
  const old=positionAt&&Number.isFinite(Date.parse(positionAt))&&Date.now()-Date.parse(positionAt)>10*60_000;
  const items=[syncedAt?`HIMOTO đọc: ${formatDateTime(syncedAt)}`:'Chưa có thời điểm đồng bộ',heartbeatAt?`Tín hiệu thiết bị: ${formatDateTime(heartbeatAt)}`:'Chưa có thời điểm tín hiệu',positionAt?`${old?'Vị trí GPS cũ':'Vị trí GPS'}: ${formatDateTime(positionAt)}`:'Chưa có thời điểm vị trí'];
  return <small className={`mg-gps-evidence${compact?' is-compact':''}`} title={items.join(' · ')}>{compact?<><span>{items[0]}</span>{old&&<span>{items[2]}</span>}</>:items.map(item=><span key={item}>{item}<br/></span>)}</small>;
}
