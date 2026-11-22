import { useCallback,useEffect,useRef,useState } from "react";
import { Text } from "react-native";
import { useQuery,useQueryClient } from "@tanstack/react-query";
import { uuid } from "expo";
import { useSession } from "@/providers/session";
import { useScreenActive } from "@/hooks/use-screen-active";
import { dateTime,useTheme } from "@/theme";
import type { ShiftReopenInput,ShiftReport } from "../../../shared/mobile-shift-reports";
import { ConfirmEdit } from "./editor-sheet";
import { ChoiceField,FormField } from "./form-fields";
import { Button,Card,InlineError } from "./ui";

export function ShiftReopen({report}:{report:ShiftReport}){
  const {api,session}=useSession();
  const cache=useQueryClient(),theme=useTheme(),active=useScreenActive();
  const id=String(report.id),userId=session!.user.id;
  const queryKey=["shift-reopen",userId,id];
  const [open,setOpen]=useState(false),[reason,setReason]=useState(""),[manual,setManual]=useState(false);
  const [confirm,setConfirm]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState("");
  const last=useRef<ShiftReopenInput|null>(null),saving=useRef(false);
  const query=useQuery({
    queryKey,queryFn:({signal})=>api!.shiftReopenStatus(id,signal),enabled:active,retry:false,
    refetchInterval:q=>active&&["pending","running"].includes(q.state.data?.request?.state??"")?4000:false,
  });
  const state=query.data,request=state?.request;
  const waiting=request?.state==="pending"||request?.state==="running";
  const canResume=waiting&&(!request.retry_at||query.dataUpdatedAt>=Date.parse(request.retry_at));
  const refreshReport=useCallback(()=>{
    void cache.invalidateQueries({queryKey:["shift",userId,id]});
    void cache.invalidateQueries({queryKey:["shift-telegram",userId,id]});
    void cache.invalidateQueries({queryKey:["shifts"]});
  },[cache,id,userId]);
  useEffect(()=>{
    if(state?.status==="draft"&&report.status==="submitted")refreshReport();
  },[state?.status,report.status,refreshReport]);

  async function submit(resume=false){
    if(!state||!api||saving.current)return;
    const text=(resume?request?.reason:reason)?.trim();
    if(!text)return;
    const manualRetraction=!resume&&manual&&state.can_manual;
    const previous=last.current;
    const input=previous&&previous.reason===text&&previous.revision===state.revision&&previous.manual===manualRetraction
      ?previous:{request_id:uuid.v4().toLowerCase(),reason:text,revision:state.revision,manual:manualRetraction};
    last.current=input;
    saving.current=true;
    setBusy(true);setConfirm(false);setError("");
    try{
      const result=await api.reopenShift(id,input);
      cache.setQueryData(queryKey,result);
      refreshReport();
      setOpen(false);
    }catch(cause){
      setError((cause as Error).message);
      void query.refetch();
    }finally{saving.current=false;setBusy(false);}
  }

  if(report.status==="draft"&&!state?.history.length)return null;
  return <Card style={{gap:12}}>
    <Text accessibilityRole="header" style={{color:theme.text,fontSize:20,fontWeight:"700"}}>Mở lại báo cáo đã chốt</Text>
    {query.isPending&&<Text style={{color:theme.muted}}>Đang kiểm tra quyền và trạng thái thu hồi…</Text>}
    {!!(error||query.error?.message)&&<InlineError message={error||query.error!.message}/>}
    {query.isError&&<Button secondary label="Kiểm tra lại trạng thái mở báo cáo" onPress={()=>{void query.refetch();}}/>}
    {!!state?.blocked_reason&&state.status==="submitted"&&<Text style={{color:theme.muted}}>{state.blocked_reason}</Text>}
    {waiting&&<Text style={{color:theme.muted}}>Đang thu hồi Telegram. Ứng dụng sẽ cập nhật khi báo cáo trở về bản nháp.</Text>}
    {canResume&&!state?.blocked_reason&&<Button secondary label="Tiếp tục yêu cầu thu hồi" loading={busy} onPress={()=>{void submit(true);}}/>}
    {request?.state==="failed"&&<InlineError message={request.error||"Chưa thu hồi được Telegram. Kiểm tra tiến độ rồi thử lại."}/>}
    {state?.status==="submitted"&&!state.blocked_reason&&!waiting&&(!open
      ?<Button secondary label="Thu hồi Telegram và mở lại báo cáo" onPress={()=>{setReason(request?.reason??"");setOpen(true);}}/>
      :<>
        <FormField label="Lý do mở lại báo cáo" value={reason} onChangeText={setReason} editable={!busy} multiline maxLength={500}/>
        {state.can_manual&&<ChoiceField label="Cách thu hồi Telegram" value={manual?"manual":"automatic"} choices={[
          {value:"automatic",label:"Hệ thống thu hồi tin"},
          {value:"manual",label:"Tôi xác nhận đã gỡ hết tin trong nhóm"},
        ]} disabled={busy} onChange={v=>setManual(v==="manual")}/>}
        <Button label="Xác nhận mở lại" loading={busy} disabled={!reason.trim()} onPress={()=>setConfirm(true)}/>
        <Button secondary label="Đóng phần mở lại" disabled={busy} onPress={()=>{setOpen(false);setManual(false);}}/>
      </>)}
    {state?.history.map(item=><Text key={item.revision} style={{color:theme.muted,lineHeight:22}}>
      {dateTime(item.reopened_at)} · {item.actor||"Nhân viên"}{item.manual_retraction?" · Đã gỡ tin thủ công":""}{"\n"}{item.reason}
    </Text>)}
    {confirm&&<ConfirmEdit title="Thu hồi Telegram và mở lại báo cáo?" message={manual?"Đã xác nhận gỡ hết tin khỏi nhóm. Báo cáo trở về bản nháp để sửa và chốt lại.":"Hệ thống thu hồi tin Telegram đã gửi trước khi đưa báo cáo về bản nháp."} confirmLabel="Thu hồi và mở lại" onCancel={()=>setConfirm(false)} onConfirm={()=>{void submit();}}/>}
  </Card>;
}
