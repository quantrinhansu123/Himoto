import {useState} from 'react';
import {Text,View} from 'react-native';
import {router} from 'expo-router';
import {uuid} from 'expo';
import {SHIFT_PHOTOS,type ShiftReport} from '../../../shared/mobile-shift-reports';
import {useSession} from '@/providers/session';
import {pendingWrites} from '@/lib/pending-writes';
import {useTheme} from '@/theme';
import {Button,Card,InlineError} from './ui';
import {PhotoBatch} from './photo-batch';
import {ChoiceField} from './form-fields';
import {BillPhoto} from './bill-photo';
import {ConfirmEdit} from './editor-sheet';
import {RecordVideoPlayer} from './record-video-player';
import {ShiftTelegramStatus} from './shift-telegram-status';
export function ShiftEvidence({report,onChanged}:{report:ShiftReport;onChanged:()=>void}){
  const{api,session}=useSession(),theme=useTheme(),[stage,setStage]=useState<'pgd'|'audit'>(report.status==='draft'?'pgd':'audit'),[category,setCategory]=useState('vehicles'),[busy,setBusy]=useState(false),[error,setError]=useState(''),[deleting,setDeleting]=useState<string|null>(null);
  const writable=stage==='pgd'?report.status==='draft'&&session!.user.permissions.some(p=>p==='contracts.draft'||p==='finance.write'):report.status==='submitted'&&report.audit?.status!=='confirmed'&&session!.user.permissions.includes('shift.review');
  async function remove(){if(!api||!session||!deleting||busy)return;const file=report.media?.find(m=>m.id===deleting);if(!file)return;setBusy(true);setError('');setDeleting(null);const scope={origin:api.origin,userId:session.user.id,storeId:session.user.allStores?null:session.user.storeId,allStores:session.user.allStores},operation=`shift.media:${report.id}`;
    try{const intent=await pendingWrites.reserveExclusive(scope,operation,[operation,`shift.update:${report.id}`,`shift.audit:${report.id}`],()=>uuid.v4().toLowerCase());if(!intent.created)throw Error('Còn thao tác báo cáo ca chưa đối chiếu. Mở Tài khoản để kiểm tra mã gốc.');await api.deleteShiftMedia(report.id,file.id,file.stage,file.category,report.revision,intent.key);const proof=await api.shiftResult(intent.key);if(proof.receipt.id!==report.id)throw Error('Phiếu không khớp báo cáo.');await pendingWrites.complete(scope,operation,intent.key);onChanged();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  return <View style={{gap:18}}><Text accessibilityRole="header" style={{color:theme.text,fontSize:23,fontWeight:'800'}}>Minh chứng PGD / KTNB</Text>
    <ChoiceField label="Phần minh chứng ca" value={stage} choices={[{value:'pgd',label:'PGD kiểm kê'},{value:'audit',label:'KTNB đối soát'}]} disabled={busy} onChange={v=>setStage(v as 'pgd'|'audit')}/>
    <ChoiceField label="Mục minh chứng ca" value={category} choices={SHIFT_PHOTOS.map(([value,label])=>({value,label}))} disabled={busy} onChange={setCategory}/>
    {(report.legacy_photos||[]).filter(slot=>stage==='pgd'&&slot===category).map(slot=><BillPhoto key={slot} context="minh chứng ca" label={`Ảnh cũ · ${slot}`} source={api!.shiftMediaSource(report.id,slot,true)}/>)}
    {(report.media||[]).filter(m=>m.stage===stage&&m.category===category).map(m=><Card key={m.id} style={{gap:12}}><Text style={{color:theme.text,fontWeight:'700'}}>{m.filename}</Text>{m.mime_type.startsWith('image/')?<BillPhoto context="minh chứng ca" label={m.filename} source={api!.shiftMediaSource(report.id,m.id)}/>:m.mime_type==='video/mp4'?<RecordVideoPlayer source={api!.shiftVideoSource(report.id,m.id,report.revision)} label={`Video ca · ${m.filename}`}/>:<Text style={{color:theme.muted}}>Video cũ chưa có bản MP4.</Text>}{writable&&<Button secondary label={`Xóa minh chứng ca · ${m.filename}`} disabled={busy} onPress={()=>setDeleting(m.id)}/>}</Card>)}
    <PhotoBatch key={`${report.id}:${stage}:${category}`} disabled={!writable||busy} adapter={{identity:`shift:${report.id}:${stage}:${category}`,label:'Bộ ảnh minh chứng ca',operation:`shift.media:${report.id}`,conflicts:[`shift.media:${report.id}`,`shift.update:${report.id}`,`shift.audit:${report.id}`],
      prepare:async()=>({revision:(await api!.shift(String(report.id))).revision,stage,category}),
      upload:async(row,attempt,bytes)=>{const info=attempt as {revision:number;stage:'pgd'|'audit';category:string};await api!.saveShiftMedia(report.id,row.id,info.stage,info.category,info.revision,bytes,row.key);const proof=await api!.shiftResult(row.key);if(proof.receipt.id!==report.id)throw Error('Phiếu minh chứng không khớp báo cáo gốc.');},
    }} nextSlot={rows=>`${category}-${rows.length+1}`} onSaved={onChanged}/>
    {writable&&<Button secondary label="Thêm video minh chứng ca" disabled={busy||(report.media||[]).filter(m=>m.stage===stage&&m.mime_type.startsWith('video/')).length>=3} onPress={()=>router.push({pathname:'/shift-video/[id]',params:{id:String(report.id),stage,category}})}/>}
    {!writable&&<Text style={{color:theme.muted,lineHeight:24}}>Phần này khóa theo trạng thái báo cáo hoặc quyền hiện tại. Bộ ảnh chờ vẫn được giữ trên thiết bị.</Text>}{!!error&&<InlineError message={error}/>}
    <ShiftTelegramStatus id={String(report.id)} stage={stage}/>
    {deleting&&<ConfirmEdit title="Xóa minh chứng ca?" message={`${report.store_name} · ${stage==='pgd'?'PGD':'KTNB'} · ${category}`} confirmLabel="Xác nhận xóa minh chứng ca" onCancel={()=>setDeleting(null)} onConfirm={()=>{void remove();}}/>}
  </View>;
}
