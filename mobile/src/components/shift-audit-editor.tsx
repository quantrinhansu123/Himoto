import { SafeAreaView } from 'react-native-safe-area-context';
import { useEffect,useRef,useState } from "react";
import { router,usePreventRemove } from "expo-router";
import { uuid } from "expo";
import { Text,View } from "react-native";
import { AUDIT_FIELDS,emptyAuditInput,parseAuditInput,auditComparisons,validateAuditConfirmation,type AuditInput,type ShiftReport,type ShiftSnapshot } from "../../../shared/mobile-shift-reports";
import { useSession } from "@/providers/session";
import { pendingWrites } from "@/lib/pending-writes";
import {requireShiftPhotosSaved} from '@/lib/shift-photo-work';
import { useTheme } from "@/theme";
import { FormField } from "./form-fields";
import { ShiftNumberField } from "./shift-number-field";
import { Button,Card,InlineError,KeyValueRow,SegmentedBar,StatusBadge } from "./ui";
import { KeyboardFormScrollView } from "./keyboard-form-scroll-view";
import { ConfirmEdit } from "./editor-sheet";
import {ShiftAuditExport} from './shift-audit-export';
import { ShiftGpsAlerts } from './shift-gps-alerts';
export function ShiftAuditEditor({report,snapshot,onRefresh}:{report:ShiftReport;snapshot:ShiftSnapshot;onRefresh:()=>void}){
  const{api,session}=useSession(),theme=useTheme(),[input,setInput]=useState<AuditInput>(()=>report.audit?.input||emptyAuditInput()),[part,setPart]=useState("counts"),[busy,setBusy]=useState(false),[pending,setPending]=useState(false),[error,setError]=useState(""),[confirm,setConfirm]=useState<"draft"|"confirmed"|null>(null),[exit,setExit]=useState<(()=>void)|null>(null),[leaving,setLeaving]=useState(false);
  const [baseline]=useState(()=>JSON.stringify(input));const alive=useRef(true),running=useRef(false);useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
  const prevent=usePreventRemove(!leaving&&(busy||pending||baseline!==JSON.stringify(input)),({repeat})=>{if(!busy)setExit(()=>repeat);});
  const readonly=!session!.user.permissions.includes("shift.review")||report.audit?.status==="confirmed",comparisons=auditComparisons(report.payload,input,snapshot);
  const update=(next:AuditInput)=>setInput(next),format=(v:number|null)=>v===null?"Chưa có":Number.isNaN(v)?"Chưa hợp lệ":v.toLocaleString("vi-VN");
  function review(status:"draft"|"confirmed"){try{const parsed=parseAuditInput(input);if(status==="confirmed")validateAuditConfirmation(report.payload,parsed,snapshot);setError("");setConfirm(status);}catch(cause){setError((cause as Error).message);}}
  async function save(){if(!api||!session||running.current||!confirm||readonly)return;running.current=true;setBusy(true);setError("");const status=confirm;setConfirm(null);
    try{const operation=`shift.audit:${report.id}`,scope={origin:api.origin,userId:session.user.id,storeId:session.user.allStores?null:session.user.storeId,allStores:session.user.allStores};if(status==='confirmed')await requireShiftPhotosSaved(scope,report.id,'audit');const intent=await pendingWrites.reserveExclusive(scope,operation,[operation,`shift.update:${report.id}`,`shift.media:${report.id}`],()=>uuid.v4().toLowerCase());if(!alive.current)return;setPending(true);if(!intent.created)throw Error("Còn thao tác báo cáo ca chưa đối chiếu. Mở Tài khoản để kiểm tra mã gốc.");await api.saveShiftAudit(String(report.id),{input:parseAuditInput(input),status,revision:report.audit?.revision||0,report_revision:report.revision,fingerprint:snapshot.fingerprint},intent.key);if(!alive.current)return;setLeaving(true);prevent();router.replace({pathname:"/shift-result/[key]",params:{key:intent.key}});}catch(cause){if(alive.current)setError((cause as Error).message);}finally{running.current=false;if(alive.current)setBusy(false);}
  }
  return <SafeAreaView edges={['bottom','left','right']} style={{flex:1,backgroundColor:theme.background}}><KeyboardFormScrollView contentContainerStyle={{padding:16,paddingBottom:40,gap:12,maxWidth:760,width:"100%",alignSelf:"center"}}>
    <View style={{gap:2}}>
      <Text accessibilityRole="header" style={{color:theme.text,fontSize:20,fontWeight:"800"}}>KTNB đối soát · {report.store_name}</Text>
      <Text style={{color:theme.muted,fontSize:12.5,lineHeight:18}}>{report.payload.date.split("-").reverse().join("/")} · Số PGD đã chốt giữ nguyên. Nhập số sổ và KTNB độc lập.</Text>
    </View>
    <ShiftGpsAlerts alerts={report.gps_alerts} />
    {report.audit&&<Card style={{gap:6,padding:13}}>
      <View style={{flexDirection:"row",justifyContent:"space-between",alignItems:"center",gap:8}}>
        <Text style={{color:theme.text,fontSize:15,fontWeight:"800"}}>Trạng thái đối soát</Text>
        <StatusBadge status={report.audit.status==="confirmed"?(report.audit.result==="matched"?"completed":"warning"):"draft"} label={report.audit.status==="confirmed"?`Đã xác nhận · ${report.audit.result==="matched"?"Khớp":"Có chênh lệch"}`:"Nháp KTNB"}/>
      </View>
      <KeyValueRow label="Người đối soát" value={report.audit.reviewer_name}/>
    </Card>}
    <ShiftAuditExport key={`${report.id}:${report.audit?.revision||0}`} report={report} disabled={busy||pending}/>
    <SegmentedBar value={part} options={[{value:"counts",label:"Số lượng & Tiền"},{value:"external",label:"Xe ngoài / ĐC"},{value:"notes",label:"Giải trình"}]} onChange={setPart} disabled={busy} />
    {part==="counts"&&comparisons.map(row=><Card key={row.key} style={{gap:10,padding:14}}>
      <View style={{flexDirection:"row",justifyContent:"space-between",alignItems:"center",gap:8}}>
        <Text style={{color:theme.text,fontSize:16,fontWeight:"800",flex:1}}>{row.label}</Text>
        <StatusBadge status={row.missing?"pending":row.different?"danger":"completed"} label={row.missing?"Chưa đủ số liệu":row.different?"Có chênh lệch":"Khớp"}/>
      </View>
      <KeyValueRow label="Số PGD / Số App" value={`${format(row.pgd)} / ${format(row.app)}`}/>
      {row.key==="assets_total"&&<KeyValueRow label="Số Sổ / Số KTNB" value={`${format(row.book)} / ${format(row.actual)}`} emphasize/>}
      {row.key!=="assets_total"&&<><ShiftNumberField label={`Sổ · ${row.label}`} value={input.book[row.key]} nullable signed={['personal','company','revenue_day','revenue_month'].includes(row.key)} disabled={readonly||busy||pending} onChange={v=>update({...input,book:{...input.book,[row.key]:v}})} /><ShiftNumberField label={`KTNB · ${row.label}`} value={input.actual[row.key]} nullable signed={['personal','company','revenue_day','revenue_month'].includes(row.key)} disabled={readonly||busy||pending} onChange={v=>update({...input,actual:{...input.actual,[row.key]:v}})} /></>}
      <KeyValueRow label="Chênh lệch (KTNB − PGD / Sổ / App)" value={`${format(row.delta_pgd)} / ${format(row.delta)} / ${format(row.delta_app)}`} valueColor={row.different?theme.danger:theme.muted} emphasize={row.different}/>
      {(row.different||row.unavailable||input.explanations[row.key])&&<FormField label={`Giải trình · ${row.label}`} value={input.explanations[row.key]||""} editable={!readonly&&!busy&&!pending} multiline maxLength={3000} onChangeText={v=>update({...input,explanations:{...input.explanations,[row.key]:v}})} />}
    </Card>)}
    {part==="external"&&<><Card style={{gap:12,padding:14}}><Text style={{color:theme.text,fontSize:16,fontWeight:"800"}}>Xe giữ bên ngoài</Text>{input.external.map((r,index)=><View key={index} style={{gap:10}}><FormField label={`Biển số KTNB bên ngoài ${index+1}`} value={r.plate} editable={!readonly&&!busy&&!pending} maxLength={30} onChangeText={v=>update({...input,external:input.external.map((x,i)=>i===index?{...x,plate:v}:x)})} /><FormField label={`Lý do KTNB bên ngoài ${index+1}`} value={r.reason} editable={!readonly&&!busy&&!pending} maxLength={500} onChangeText={v=>update({...input,external:input.external.map((x,i)=>i===index?{...x,reason:v}:x)})} /><Button size="sm" secondary danger label={`Bỏ xe KTNB bên ngoài ${index+1}`} disabled={readonly||busy||pending} onPress={()=>update({...input,external:input.external.filter((_,i)=>i!==index)})} /></View>)}<Button size="sm" secondary label="Thêm xe KTNB giữ bên ngoài" disabled={readonly||busy||pending||input.external.length>=100} onPress={()=>update({...input,external:[...input.external,{plate:"",reason:""}]})} /></Card>
    <Card style={{gap:12,padding:14}}><Text style={{color:theme.text,fontSize:16,fontWeight:"800"}}>Điều chuyển KTNB ghi nhận</Text>{snapshot.transfers.map((t,i)=><KeyValueRow key={i} label={`App · ${t.plate}`} value={`${t.from} → ${t.to}`}/>)}{input.transfers.map((r,index)=><View key={index} style={{gap:10}}>{([['plate','Biển số'],['from','Nơi đi'],['to','Nơi đến']] as const).map(([key,label])=><FormField key={key} label={`${label} KTNB điều chuyển ${index+1}`} value={r[key]} editable={!readonly&&!busy&&!pending} maxLength={key==="plate"?30:191} onChangeText={v=>update({...input,transfers:input.transfers.map((x,i)=>i===index?{...x,[key]:v}:x)})} />)}<Button size="sm" secondary danger label={`Bỏ điều chuyển KTNB ${index+1}`} disabled={readonly||busy||pending} onPress={()=>update({...input,transfers:input.transfers.filter((_,i)=>i!==index)})} /></View>)}<Button size="sm" secondary label="Thêm điều chuyển KTNB" disabled={readonly||busy||pending||input.transfers.length>=100} onPress={()=>update({...input,transfers:[...input.transfers,{plate:"",from:"",to:""}]})} /></Card></>}
    {part==="notes"&&<Card style={{gap:12,padding:14}}>{[...AUDIT_FIELDS.map(([key,label])=>({key,label})),{key:"assets_total",label:"Tổng tài sản xe"},{key:"transfers",label:"Điều chuyển"}].map(({key,label})=><FormField key={key} label={`Giải trình ${label}`} value={input.explanations[key as keyof AuditInput['explanations']]||""} editable={!readonly&&!busy&&!pending} multiline maxLength={3000} onChangeText={v=>update({...input,explanations:{...input.explanations,[key]:v}})} />)}<FormField label="Kết luận và ghi chú KTNB" value={input.notes} editable={!readonly&&!busy&&!pending} maxLength={5000} multiline onChangeText={v=>update({...input,notes:v})} /></Card>}
    <Card style={{gap:6,padding:13}}><Text style={{color:theme.muted,fontSize:13,lineHeight:19}}>{snapshot.inventory_note}</Text><Text style={{color:theme.muted,fontSize:13,lineHeight:19}}>{snapshot.accounts_note}</Text><KeyValueRow label="Phiếu chưa phân loại" value={String(snapshot.unclassified_count??"Chưa có nguồn")}/></Card>
    {!readonly&&<><Button size="sm" secondary label="Lấy lại số liệu app cho KTNB" disabled={busy||pending} onPress={onRefresh} /><View style={{flexDirection:"row",gap:8}}><Button equalWidth secondary label="Lưu nháp KTNB" loading={busy} disabled={pending} onPress={()=>review("draft")} /><Button equalWidth label="Rà soát xác nhận KTNB" loading={busy} disabled={pending} onPress={()=>review("confirmed")} /></View></>}
    {!!error&&<InlineError message={error} />}{pending&&!busy&&<Button label="Mở Tài khoản đối chiếu KTNB" onPress={()=>{setLeaving(true);prevent();router.push("/(tabs)/account");}} />}
    {confirm&&<ConfirmEdit title={confirm==="confirmed"?"Xác nhận đối soát KTNB?":"Lưu nháp KTNB?"} message="Số liệu PGD đã chốt giữ nguyên. Máy chủ kiểm lại phiên bản báo cáo, bản đối soát và dấu vân tay số liệu app trước khi ghi. Sau xác nhận, đối soát và minh chứng KTNB được khóa." confirmLabel={confirm==="confirmed"?"Xác nhận đối soát KTNB":"Xác nhận lưu nháp KTNB"} onCancel={()=>setConfirm(null)} onConfirm={()=>{void save();}} />}
    {exit&&<ConfirmEdit title="Rời biểu mẫu KTNB?" message="Giữ các mã chưa rõ kết quả trong Tài khoản; thay đổi biểu mẫu chưa lưu sẽ bị bỏ." confirmLabel="Rời đối soát KTNB" onCancel={()=>setExit(null)} onConfirm={()=>{const repeat=exit;setExit(null);setLeaving(true);prevent();repeat();}} />}
  </KeyboardFormScrollView></SafeAreaView>;
}
