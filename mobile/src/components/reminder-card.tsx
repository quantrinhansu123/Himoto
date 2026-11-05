import { useState } from "react";
import { Text,View } from "react-native";
import { router } from "expo-router";
import { REMINDER_STATUS_LABELS,reminderResultMessage,type DebtReminderRow } from "../../../shared/mobile-debt-reminders";
import { money,useTheme } from "@/theme";
import { Button,Card } from "./ui";
export function ReminderCard({row,details=false}:{row:DebtReminderRow;details?:boolean}) {
  const theme=useTheme(),[expanded,setExpanded]=useState(details);
  return <Card style={{gap:12}}>
    <Text accessibilityRole="header" style={{color:theme.text,fontSize:21,fontWeight:"800"}}>{row.contract_code} · {row.customer_name}</Text>
    <Text style={{color:theme.text,fontSize:23,fontWeight:"800"}}>{money(row.amount)}</Text>
    <Text style={{color:theme.muted,lineHeight:23}}>{row.phone} · {row.store_name}</Text>
    <Text style={{color:theme.muted}}>{new Intl.DateTimeFormat("vi-VN",{timeZone:"Asia/Ho_Chi_Minh",dateStyle:"short",timeStyle:"short"}).format(new Date(row.created_at))} · {row.actor_name || "—"}</Text>
    <Text accessibilityLiveRegion="polite" style={{color:row.status==="failed"?theme.danger:row.status==="accepted"?theme.success:theme.text,fontWeight:"700",fontSize:17}}>{REMINDER_STATUS_LABELS[row.status]}</Text>
    {expanded&&<View style={{gap:12}}><Text selectable style={{color:theme.text,lineHeight:25}}>{row.message}</Text><Text style={{color:theme.muted,lineHeight:23}}>{reminderResultMessage(row.status)}</Text><Text selectable style={{color:theme.muted}}>Mã lần gửi: {row.request_id}</Text></View>}
    {!details&&<Button secondary label={`${expanded?"Ẩn":"Xem"} nội dung · ${row.contract_code}`} onPress={()=>setExpanded(v=>!v)} />}
    <Button secondary label={`Mở hợp đồng · ${row.contract_code}`} onPress={()=>router.push({pathname:"/record/[kind]/[id]",params:{kind:"contracts",id:String(row.order_id)}})} />
  </Card>;
}
