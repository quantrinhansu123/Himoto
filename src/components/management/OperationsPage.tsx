'use client';
import Link from 'next/link';
import { CalendarPlus, FilePlus2, RefreshCw, RotateCcw } from 'lucide-react';
import { useManagement } from './ManagementProvider';
import { useCallback,useEffect,useState } from 'react';
import { ReloadButton, useReloadAction } from './ReloadButton';
import { useRouter } from 'next/navigation';
import { mapApiRow } from '@/lib/management/repository';
const actions = [
  {href:'/contracts?action=new',label:'Làm hợp đồng',description:'Chọn khách, xe và xác nhận tiền đã nhận.',icon:FilePlus2},
  {href:'/contracts?action=return',label:'Trả xe',description:'Tìm biển số hoặc hợp đồng để nhận trả.',icon:RotateCcw},
  {href:'/contracts?action=renew',label:'Gia hạn',description:'Chọn hợp đồng và cập nhật ngày hẹn trả.',icon:CalendarPlus},
  {href:'/vehicles?action=status',label:'Trạng thái kho xe',description:'Xe có hợp đồng đang thuê cần xử lý Trả xe trước.',icon:RefreshCw},
];
export function OperationsPage() {
  const router=useRouter();const [plate,setPlate]=useState('');
  const {selectedStore,loading:storeLoading,error:storeError,resources} = useManagement();
  const [stats,setStats]=useState<{store_id:number|null;active:number;overdue:number}[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[retry,setRetry]=useState(0);
  useReloadAction(useCallback(()=>setRetry(value=>value+1),[]));
  useEffect(()=>{const controller=new AbortController();setLoading(true);setError('');
    fetch('/api/auth/order/car-rental?summary=operations',{cache:'no-store',credentials:'same-origin',signal:controller.signal}).then(async response=>{const result=await response.json();if(!response.ok||result.status!=='success')throw Error('Không tải được thống kê.');
      if(Array.isArray(result.data)){const grouped=new Map<number,{store_id:number;active:number;overdue:number}>();for(const raw of result.data){const row=mapApiRow('contracts',raw),id=Number(row.store_id),entry=grouped.get(id)||{store_id:id,active:0,overdue:0};if(['renting','overdue','wait_payment'].includes(row.status))entry.active++;if(row.status==='overdue')entry.overdue++;grouped.set(id,entry);}return [...grouped.values()];}
      if(!Array.isArray(result.data?.stores))throw Error('Thống kê không hợp lệ.');return result.data.stores;
    }).then(data=>{if(!controller.signal.aborted)setStats(data);}).catch(cause=>{if(!controller.signal.aborted)setError(cause instanceof Error?cause.message:'Không tải được thống kê.');}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});return()=>controller.abort();},[resources.contracts,retry]);
  const scoped=stats.filter(row=>selectedStore==='all'||String(row.store_id)===selectedStore),active=scoped.reduce((sum,row)=>sum+row.active,0),overdue=scoped.reduce((sum,row)=>sum+row.overdue,0),pending=loading||storeLoading;
  return <section className="mg-page mg-operations-page"><div className="mg-page-content"><div className="mg-page-heading"><div><h1>Thao tác nhanh</h1><p>Làm hợp đồng và xử lý xe tại quầy.</p></div><ReloadButton busy={pending} onClick={()=>setRetry(value=>value+1)}/></div>
    <div className="mg-operation-actions">{actions.map(action=><Link className="mg-operation-action" key={action.href} href={action.href}><action.icon size={24}/><strong>{action.label}</strong><span>{action.description}</span></Link>)}</div>
    <form className="mg-return-search" onSubmit={event=>{event.preventDefault();if(plate.trim())router.push(`/contracts?action=return&query=${encodeURIComponent(plate.trim())}`);}}><label htmlFor="operations-return-plate">Nhận trả xe nhanh theo biển số / SĐT</label><input id="operations-return-plate" value={plate} onChange={event=>setPlate(event.target.value)} placeholder="VD: 34C1-358.49"/><button className="mg-button mg-button-primary" disabled={!plate.trim()}>Tìm hợp đồng đang thuê & trả xe</button></form>
    {(error||storeError) && <p className="mg-field-error" role="alert">{error||storeError}</p>}
    <div className="mg-operation-links" aria-busy={pending}><Link href="/contracts"><strong>{pending||error ? '—' : active}</strong> hợp đồng đang thuê</Link><Link href="/contracts/overdue"><strong>{pending||error ? '—' : overdue}</strong> hợp đồng quá hạn</Link><Link href="/contracts/drafts">Tiếp tục hợp đồng nháp</Link><Link href="/contracts/due">Xem khoản đến hạn đóng tiền</Link></div>
  </div></section>;
}
