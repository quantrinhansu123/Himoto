import { useQuery } from "@tanstack/react-query";
import { Text, View } from "react-native";
import { SHIFT_SUMMARY_FIELDS,OWNERSHIP_REPORT_GROUPS,reconciliation,shiftReportTypeLabel,shiftVehicleTotal,type ShiftReport,type ShiftTransfer } from "../../../shared/mobile-shift-reports";
import { useSession } from "@/providers/session";
import { useTheme,money } from "@/theme";
import { Card, KeyValueRow, StatusBadge } from "./ui";
import { FileExportButton } from "./file-export-button";

const transferStatuses: Record<ShiftTransfer["status"], string> = {
  pending: "Đã đi · Chưa nhận",
  received: "Đã nhận",
  rejected: "Đã từ chối",
  cancelled: "Đã hủy",
};

export function ShiftSummary({report}:{report:ShiftReport}){
  const theme=useTheme(),{api,session}=useSession(),p=report.payload;
  const transferQuery=useQuery({
    queryKey:["shift-transfers",session?.user.id,p.store_id,p.date],
    queryFn:({signal})=>api!.shiftAutofill(p.store_id,p.date,"transfers",signal),
    enabled:!!api&&!!session&&p.store_id>0&&!!p.date,
    staleTime:60_000,
  });
  const transfers=transferQuery.data?.transfers||[];
  return <><Card style={{gap:8,padding:14}}>
    <View style={{flexDirection:"row",justifyContent:"space-between",alignItems:"center",gap:8}}>
      <Text accessibilityRole="header" style={{color:theme.text,fontSize:18,fontWeight:"800",flex:1}}>{report.store_name} · {p.date.split("-").reverse().join("/")}</Text>
      <StatusBadge status={report.status==="draft"?"draft":"completed"} label={report.status==="draft"?"Nháp PGD":"PGD đã chốt"}/>
    </View>
    <View style={{gap:2,borderTopWidth:1,borderTopColor:theme.border,paddingTop:6}}>
      <KeyValueRow label="Loại báo cáo" value={shiftReportTypeLabel(p.report_type)} emphasize valueColor={theme.primary}/>
      <KeyValueRow label="Nhân sự" value={p.staff}/>
      <KeyValueRow label="Người lập / Phiên bản" value={`${report.created_by_name} · v${report.revision}`}/>
      <KeyValueRow label="Cập nhật" value={new Intl.DateTimeFormat("vi-VN",{timeZone:"Asia/Ho_Chi_Minh",dateStyle:"short",timeStyle:"short"}).format(new Date(report.updated_at))}/>
    </View>
  </Card>
  <Card style={{gap:8,padding:14}}>
    <Text style={{color:theme.text,fontWeight:"800",fontSize:16}}>Kiểm kê xe / pin</Text>
    <View style={{gap:2}}>
      {[["Xe tại PGD",p.vehicles],["Xe thuê ngày",p.daily_vehicles],["Xe thuê tháng",p.monthly_vehicles],["Xe khác / thuê sở hữu",p.other_vehicles],["Tổng tài sản xe",shiftVehicleTotal(p)],["Pin cửa hàng",p.batteries],["Pin đầy",p.charged],["Pin đã cho thuê",p.rented_batteries],["Xe điều chuyển",p.transfers]].map(([label,value])=><KeyValueRow key={String(label)} label={String(label)} value={value==null?"Chưa ghi nhận":String(value)} emphasize={label==="Tổng tài sản xe"}/>)}
      {p.external_vehicles?.map((r,index)=><KeyValueRow key={index} label={`Xe ngoài · ${r.plate}`} value={r.reason}/>)}
    </View>
    {transfers.length>0&&<View style={{gap:6,paddingTop:6,borderTopWidth:1,borderTopColor:theme.border}}>
      <Text style={{color:theme.text,fontWeight:"700",fontSize:14}}>Danh sách xe điều chuyển trong ngày ({transfers.length} lượt)</Text>
      {transfers.map(item=><KeyValueRow key={item.id} label={`${item.plate||"—"} (${item.direction==="out"?"Đi":"Đến"})`} value={`${item.from||"—"} → ${item.to||"—"} · ${transferStatuses[item.status]}`}/>)}
      {!!api&&<FileExportButton
        label="Tải Excel danh sách xe điều chuyển (.xlsx)"
        load={signal=>api.exportWorkbook({
          filename:`himoto-dieu-chuyen-ca-${report.id}`,
          headers:["Biển số","Chiều","Cơ sở đi","Cơ sở đến","Thời điểm","Trạng thái"],
          rows:transfers.map(t=>[t.plate||"",t.direction==="out"?"Đi":"Đến",t.from||"",t.to||"",t.at,transferStatuses[t.status]]),
        },signal)}
      />}
    </View>}
  </Card>
  <Card style={{gap:6,padding:14}}><Text style={{color:theme.text,fontWeight:"800",fontSize:16}}>Hợp đồng và thu chi</Text>{SHIFT_SUMMARY_FIELDS.map(([key,label,currency])=><KeyValueRow key={key} label={label} value={p.summary?.[key]==null?"Chưa ghi nhận":currency?money(p.summary[key]):String(p.summary[key])}/>)}</Card>
  <Card style={{gap:6,padding:14}}>
    <Text style={{color:theme.text,fontWeight:"800",fontSize:16}}>Tiền và an toàn</Text>
    <KeyValueRow label="Tiền mặt tại két" value={money(p.cash)} emphasize/>
    <KeyValueRow label="TK cá nhân" value={money(p.personal)}/>
    <KeyValueRow label="TK Công ty" value={money(p.company)}/>
    <KeyValueRow label="An toàn điện" value={p.electricity_off?"Đã xác nhận tắt thiết bị điện":"Chưa xác nhận tắt thiết bị điện"} valueColor={p.electricity_off?theme.success:theme.warning}/>
    <KeyValueRow label="Thiết bị điện" value={p.electrical_devices||"Chưa ghi danh sách thiết bị"}/>
    <KeyValueRow label="Ghi chú" value={p.notes||"Không có ghi chú"} selectable/>
  </Card>
  {p.ownership_report&&<>
    <Card style={{gap:6,padding:14}}>
      <Text style={{color:theme.text,fontWeight:"800",fontSize:16}}>Đối chiếu tài khoản thuê sở hữu</Text>
      <KeyValueRow label="TK THU (Thực tế / App)" value={`${money(p.ownership_report.values.thu_actual)} / ${money(p.ownership_report.thu_balance)} (${reconciliation(p.ownership_report.values.thu_actual,p.ownership_report.thu_balance)})`}/>
      <KeyValueRow label="TK CTY (Thực tế / App)" value={`${money(p.ownership_report.values.company_actual)} / ${money(p.ownership_report.company_balance)} (${reconciliation(p.ownership_report.values.company_actual,p.ownership_report.company_balance)})`}/>
      <KeyValueRow label="Sổ thu trong ngày" value={`${money(p.ownership_report.values.book_income)} / ${money(p.ownership_report.app.income_day)} (${reconciliation(p.ownership_report.values.book_income,p.ownership_report.app.income_day)})`}/>
    </Card>
    {OWNERSHIP_REPORT_GROUPS.map(group=><Card key={group.title} style={{gap:6,padding:14}}><Text style={{color:theme.text,fontWeight:"800",fontSize:16}}>{group.title}</Text>{group.fields.map(([key,label])=><KeyValueRow key={key} label={label} value={`${p.ownership_report!.values[key]===null?"Chưa ghi nhận":p.ownership_report!.values[key]?.toLocaleString("vi-VN")} (App: ${p.ownership_report!.app[key]===null?"Chưa có nguồn":p.ownership_report!.app[key]?.toLocaleString("vi-VN")})`}/>)}</Card>)}
  </>}
  </>;
}
