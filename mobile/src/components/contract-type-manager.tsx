import { useEffect,useRef,useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { router, usePreventRemove } from 'expo-router';
import { uuid } from 'expo';
import { Plus } from 'lucide-react-native';
import { useSession } from '@/providers/session';
import { pendingWrites } from '@/lib/pending-writes';
import { useTheme } from '@/theme';
import { Button, Card, InlineError, KeyValueRow, SkeletonList, StateView, StatusBadge } from './ui';
import { ChoiceField,FormField } from './form-fields';
import { FileExportButton } from './file-export-button';
import { ShiftNumberField } from './shift-number-field';
import { ConfirmEdit,EditorSheet } from './editor-sheet';
import { ContractTypeResult } from './contract-type-result';
import { CONTRACT_TYPE_BILLING,parseContractType,type ContractType,type ContractTypeInput } from '../../../shared/mobile-contract-types';
type SavePlan={editing:boolean;input:ContractTypeInput|{id:string;revision:string;label:string;active:boolean}};
export function ContractTypeManager({onClose,onCreated}:{onClose?:()=>void;onCreated?:(type:ContractType)=>void}){
  const{api,session}=useSession(),theme=useTheme(),allowed=!!session?.user.permissions.includes('contracts.read'),canWrite=allowed&&session!.user.permissions.includes('settings.write')&&session!.user.permissions.includes('finance.write');
  const query=useQuery({queryKey:['contract-types',session?.user.id],queryFn:({signal})=>api!.contractTypes(signal),enabled:!!api&&allowed,retry:false});
  const[editing,setEditing]=useState<ContractType|null>(null),[editor,setEditor]=useState(false),[label,setLabel]=useState(''),[billing,setBilling]=useState<ContractTypeInput['rental_type']>('daily'),[months,setMonths]=useState<number|null>(null),[search,setSearch]=useState(''),[status,setStatus]=useState(''),[plan,setPlan]=useState<SavePlan|null>(null),[busy,setBusy]=useState(false),[pending,setPending]=useState(false),[error,setError]=useState(''),[requestKey,setRequestKey]=useState(''),[exit,setExit]=useState<(()=>void)|null>(null),[leaving,setLeaving]=useState(false);
  const alive=useRef(true),running=useRef(false);useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
  const dirty=editor&&(label!==(editing?.label||'')||!editing&&(billing!=='daily'||months!==null));const prevent=usePreventRemove(!onClose&&!leaving&&(busy||pending||dirty),({repeat})=>{if(!busy)setExit(()=>repeat);});
  function reset(){setLeaving(false);setEditor(false);setEditing(null);setLabel('');setBilling('daily');setMonths(null);setError('');setPlan(null);}
  function close(){if(busy)return;if(dirty||pending){setExit(()=>()=>onClose?.());return;}onClose?.();}
  function review(){try{const input=editing?{id:editing.id,revision:editing.revision,label,active:editing.active}:{label,rental_type:billing,term_months:billing==='daily'?null:months,active:true};parseContractType(input,!!editing);setError('');setPlan({editing:!!editing,input});}catch(cause){setError((cause as Error).message);}}
  async function save(){if(!api||!session||!plan||running.current)return;const next=plan;setPlan(null);running.current=true;setBusy(true);setError('');try{const scope={origin:api.origin,userId:session.user.id,storeId:session.user.allStores?null:session.user.storeId,allStores:session.user.allStores},operation=next.editing?'ctype.update':'ctype.create',intent=await pendingWrites.reserveExclusive(scope,operation,['ctype.create','ctype.update'],()=>uuid.v4().toLowerCase());if(!alive.current)return;setPending(true);if(!intent.created)throw Error('Còn thay đổi loại hợp đồng chưa đối chiếu. Mở Tài khoản để kiểm tra mã gốc.');await api.saveContractType(next.editing,next.input,intent.key);if(alive.current)setRequestKey(intent.key);}catch(cause){if(alive.current)setError((cause as Error).message);}finally{running.current=false;if(alive.current)setBusy(false);}}
  let content;
  if(!api||!session||!allowed)content=<StateView title="Không có quyền xem loại hợp đồng" />;
  else if(requestKey)content=<ContractTypeResult requestKey={requestKey} onDone={(current,operation)=>{setPending(false);setRequestKey('');reset();if(operation==='ctype.create'&&current.active&&onCreated)onCreated(current);}} />;
  else content=<KeyboardAvoidingView enabled={!onClose} style={{flex:1,backgroundColor:theme.background}} behavior={Platform.OS==='ios'?'padding':'height'}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{padding:16,paddingBottom:36,gap:12,maxWidth:760,width:'100%',alignSelf:'center'}}>
    <View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center',gap:10}}>
      <View style={{flex:1,gap:2}}>
        <Text accessibilityRole="header" style={{color:theme.text,fontSize:22,fontWeight:'800'}}>Loại hợp đồng</Text>
        <Text style={{color:theme.muted,fontSize:12.5,lineHeight:18}}>Thêm loại mới, đổi tên hoặc ẩn loại không cần.</Text>
      </View>
      {!editor&&canWrite&&<Button size="sm" icon={<Plus size={14} color={theme.primaryText} />} label="Thêm loại" disabled={pending||query.isPending||query.isError} onPress={()=>{reset();setEditor(true);}} />}
    </View>
    {!!error&&<InlineError message={error} />}{pending&&!busy&&<Button size="sm" secondary label="Đối chiếu loại hợp đồng trong Tài khoản" onPress={()=>{setLeaving(true);prevent();onClose?.();router.push('/(tabs)/account');}} />}
    {editor&&<Card style={{gap:12}}><Text style={{color:theme.text,fontSize:18,fontWeight:'800'}}>{editing?'Đổi tên loại hợp đồng':'Thêm loại hợp đồng'}</Text><FormField label="Tên loại hợp đồng" value={label} onChangeText={setLabel} maxLength={80} editable={!busy&&!pending} autoCapitalize="sentences" />{editing?<><KeyValueRow label="Cách tính tiền" value={CONTRACT_TYPE_BILLING.find(t=>t.value===editing.rental_type)?.label||'Theo loại đã lưu'} /><KeyValueRow label="Thời hạn gợi ý" value={editing.term_months===null?'Không gợi ý':`${editing.term_months} tháng`} /></>:<><ChoiceField label="Cách tính tiền" value={billing} choices={[...CONTRACT_TYPE_BILLING]} disabled={busy||pending} onChange={v=>{setBilling(v as ContractTypeInput['rental_type']);if(v==='daily')setMonths(null);}} /><ShiftNumberField label="Thời hạn gợi ý (tháng)" value={months} nullable disabled={busy||pending||billing==='daily'} onChange={setMonths} /></>}<View style={{flexDirection:'row',gap:8}}><Button size="sm" equalWidth secondary label="Hủy" disabled={busy||pending} onPress={()=>{if(dirty)setExit(()=>reset);else reset();}} /><Button size="sm" equalWidth label={editing?'Lưu tên mới':'Thêm loại'} disabled={pending} loading={busy} onPress={review} /></View></Card>}
    {!canWrite&&<Text style={{color:theme.muted,fontSize:12.5}}>Tài khoản chỉ có quyền xem danh mục. Chỉnh sửa cần quyền cấu hình và kế toán.</Text>}
    <FormField label="Tìm tên loại hợp đồng" value={search} onChangeText={setSearch} />
    <ChoiceField label="Trạng thái" value={status} choices={[{value:'',label:'Tất cả'},{value:'active',label:'Đang dùng'},{value:'hidden',label:'Đã ẩn'}]} onChange={setStatus} />
    {query.data&&<FileExportButton
      label="Tải Excel danh mục loại hợp đồng"
      disabled={query.isFetching}
      load={signal=>api.exportWorkbook({
        filename:'himoto-loai-hop-dong',
        headers:['Mã loại','Tên loại hợp đồng','Cách tính tiền','Thời hạn gợi ý (tháng)','Trạng thái'],
        rows:query.data.filter(t=>(!status||t.active===(status==='active'))&&t.label.toLocaleLowerCase('vi').includes(search.trim().toLocaleLowerCase('vi'))).map(t=>[
          t.id,
          t.label,
          CONTRACT_TYPE_BILLING.find(b=>b.value===t.rental_type)?.label||t.rental_type,
          t.term_months??'',
          t.active?'Đang dùng':'Đã ẩn',
        ]),
      },signal)}
    />}
    {query.isPending?<SkeletonList count={4} lines={2} />:query.isError?<StateView title="Chưa tải được loại hợp đồng" message={query.error.message} retry={()=>{void query.refetch();}} />:query.data.filter(t=>(!status||t.active===(status==='active'))&&t.label.toLocaleLowerCase('vi').includes(search.trim().toLocaleLowerCase('vi'))).map(t=><Card key={t.id} style={{gap:8,padding:13}}>
      <View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center',gap:8}}>
        <Text style={{color:theme.text,fontSize:16,fontWeight:'800',flex:1}}>{t.label}</Text>
        <StatusBadge status={t.active?'active':'draft'} label={t.active?'Đang dùng':'Đã ẩn'} />
      </View>
      <View style={{gap:2}}>
        <KeyValueRow label="Cách tính tiền" value={CONTRACT_TYPE_BILLING.find(b=>b.value===t.rental_type)?.label||'Theo loại đã lưu'} />
        {!!t.term_months&&<KeyValueRow label="Thời hạn gợi ý" value={`${t.term_months} tháng`} />}
      </View>
      {canWrite&&<View style={{flexDirection:'row',gap:8,paddingTop:2}}>
        <Button size="sm" equalWidth secondary label="Đổi tên" disabled={busy||pending||editor} onPress={()=>{setEditing(t);setLabel(t.label);setMonths(t.term_months);setEditor(true);setError('');}} />
        <Button size="sm" equalWidth secondary label={t.active?'Ẩn loại':'Hiện lại'} disabled={busy||pending||editor} onPress={()=>setPlan({editing:true,input:{id:t.id,revision:t.revision,label:t.label,active:!t.active}})} />
      </View>}
    </Card>)}
  </ScrollView></KeyboardAvoidingView>;
  const body=<>{content}{plan&&<ConfirmEdit title="Lưu loại hợp đồng?" message={`${plan.input.label}\n${'rental_type'in plan.input?CONTRACT_TYPE_BILLING.find(t=>t.value===('rental_type'in plan.input?plan.input.rental_type:''))?.label||'':plan.input.active?'Đang dùng':'Ẩn khỏi lựa chọn mới'}\nHợp đồng đã lưu giữ nguyên nội dung.`} confirmLabel="Xác nhận lưu loại hợp đồng" onCancel={()=>setPlan(null)} onConfirm={()=>{void save();}} />}{exit&&<ConfirmEdit title="Rời danh mục loại hợp đồng?" message={pending?'Mã gốc vẫn giữ trong Tài khoản để đối chiếu trước khi lưu tiếp.':'Thay đổi chưa lưu sẽ bị bỏ.'} confirmLabel="Rời phần sửa loại hợp đồng" onCancel={()=>setExit(null)} onConfirm={()=>{const repeat=exit;setExit(null);setLeaving(true);prevent();repeat();}} />}</>;
  return onClose?<EditorSheet title="Quản lý loại hợp đồng" onClose={close}>{body}</EditorSheet>:body;
}
