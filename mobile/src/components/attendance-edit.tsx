import {useRef,useState} from 'react';
import {usePreventRemove} from 'expo-router';
import {Text} from 'react-native';
import type {AttendanceEntry} from '../../../shared/mobile-support';
import {useSession} from '@/providers/session';
import {useTheme} from '@/theme';
import {EditorSheet,ConfirmEdit} from './editor-sheet';
import {KeyboardFormScrollView} from './keyboard-form-scroll-view';
import {RentalDateTime} from './rental-date-time';
import {Button,InlineError} from './ui';
const local=(value:string)=>new Date(Date.parse(value)+7*3600000).toISOString().slice(0,16);
function iso(value:string){const result=new Date(value+':00+07:00');if(!/^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(value)||!Number.isFinite(result.getTime())||local(result.toISOString())!==value)throw Error('Giờ chấm công không hợp lệ.');return result.toISOString();}
export function AttendanceEdit({row,onClose,onReload}:{row:AttendanceEntry;onClose:()=>void;onReload:()=>void}){
 const {api}=useSession(),theme=useTheme(),lock=useRef(false),[start,setStart]=useState(()=>local(row.clock_in_at)),[end,setEnd]=useState(()=>row.clock_out_at?local(row.clock_out_at):''),[busy,setBusy]=useState(false),[uncertain,setUncertain]=useState(false),[error,setError]=useState(''),[confirm,setConfirm]=useState<'PATCH'|'DELETE'|null>(null);
 usePreventRemove(busy,()=>{});
 async function save(method:'PATCH'|'DELETE'){
  if(lock.current||uncertain||!row.can_manage)return;
  let input;try{input={id:row.id,original_in:row.clock_in_at,original_out:row.clock_out_at,...(method==='PATCH'?{clock_in_at:start===local(row.clock_in_at)?row.clock_in_at:iso(start),clock_out_at:end===(row.clock_out_at?local(row.clock_out_at):'')?row.clock_out_at:iso(end)}:{})};}catch(cause){setConfirm(null);setError((cause as Error).message);return;}
  lock.current=true;setBusy(true);setConfirm(null);setError('');
  try{await api!.manageAttendance(method,input);onReload();}catch(cause){setUncertain(true);setError((cause as Error).message+' Tải lại để đối chiếu trước khi sửa tiếp.');}finally{lock.current=false;setBusy(false);}
 }
 return <EditorSheet title="Sửa chấm công" onClose={()=>{if(!busy)onClose();}}><KeyboardFormScrollView contentContainerStyle={{padding:20,gap:18}}>
  <Text style={{color:theme.text,fontWeight:'700'}}>{row.staff_name} · #{row.id}</Text>
  <RentalDateTime label="vào ca" value={start} onChange={setStart} disabled={busy||uncertain}/><RentalDateTime label="ra ca" value={end} onChange={setEnd} disabled={busy||uncertain}/>
  <Text style={{color:theme.muted,lineHeight:22}}>Chỉ sửa giờ vào/ra; ảnh và GPS được giữ nguyên. Thời gian được hiển thị theo giờ Việt Nam.</Text>
  {!!error&&<InlineError message={error}/>}<Button label="Lưu thay đổi" disabled={busy||uncertain} onPress={()=>setConfirm('PATCH')}/><Button secondary label="Xóa lượt chấm công" disabled={busy||uncertain} onPress={()=>setConfirm('DELETE')}/>
  {uncertain&&<Button secondary label="Tải lại để đối chiếu" disabled={busy} onPress={onReload}/>}
  {confirm&&<ConfirmEdit title={confirm==='DELETE'?'Xóa lượt chấm công?':'Lưu thay đổi chấm công?'} message={confirm==='DELETE'?`Xóa lượt #${row.id} của ${row.staff_name}, gồm ảnh/GPS đính kèm.`:`${row.staff_name} · Vào: ${start} · Ra: ${end||'Đang trong ca'}`} confirmLabel={confirm==='DELETE'?'Xóa lượt chấm công':'Lưu thay đổi'} onCancel={()=>setConfirm(null)} onConfirm={()=>void save(confirm)}/>}
 </KeyboardFormScrollView></EditorSheet>;
}
