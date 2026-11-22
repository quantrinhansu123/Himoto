import { useQuery } from "@tanstack/react-query";
import { Text, View } from "react-native";
import { SHIFT_SUMMARY_FIELDS,OWNERSHIP_REPORT_GROUPS,reconciliation,shiftReportTypeLabel,shiftVehicleTotal,type ShiftReport,type ShiftTransfer } from "../../../shared/mobile-shift-reports";
import { useSession } from "@/providers/session";
import { useTheme,money } from "@/theme";
import { Card } from "./ui";
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
  return <><Card style={{gap:12}}><Text accessibilityRole="header" style={{color:theme.text,fontSize:23,fontWeight:"800"}}>{report.store_name} · {p.date.split("-").reverse().join("/")}</Text><Text style={{color:theme.primary,fontWeight:"700"}}>Loại báo cáo: {shiftReportTypeLabel(p.report_type)}</Text><Text style={{color:theme.text,fontWeight:"700"}}>{report.status==="draft"?"Nháp PGD":"PGD đã chốt"} · Phiên bản {report.revision}</Text><Text style={{color:theme.muted,lineHeight:24}}>Nhân sự: {p.staff} · Người lập: {report.created_by_name}</Text><Text style={{color:theme.muted}}>Cập nhật: {new Intl.DateTimeFormat("vi-VN",{timeZone:"Asia/Ho_Chi_Minh",dateStyle:"short",timeStyle:"short"}).format(new Date(report.updated_at))}</Text></Card>
  <Card style={{gap:12}}><Text style={{color:theme.text,fontWeight:"800",fontSize:20}}>Kiểm kê xe / pin</Text>{[["Xe tại PGD",p.vehicles],["Xe thuê ngày",p.daily_vehicles],["Xe thuê tháng",p.monthly_vehicles],["Xe khác / thuê sở hữu",p.other_vehicles],["Tổng tài sản xe",shiftVehicleTotal(p)],["Pin cửa hàng",p.batteries],["Pin đầy",p.charged],["Pin đã cho thuê",p.rented_batteries],["Xe điều chuyển",p.transfers]].map(([label,value])=><Text key={String(label)} style={{color:theme.text}}>{label}: {value??"Chưa ghi nhận"}</Text>)}{p.external_vehicles?.map((r,index)=><Text key={index} style={{color:theme.muted}}>{r.plate} · {r.reason}</Text>)}
    {transfers.length>0&&<View style={{gap:8,paddingTop:6,borderTopWidth:1,borderTopColor:theme.border}}>
      <Text style={{color:theme.text,fontWeight:"700"}}>Danh sách xe điều chuyển trong ngày ({transfers.length} lượt)</Text>
      {transfers.map(item=><Text key={item.id} style={{color:theme.muted,lineHeight:21}}>• {item.plate||"—"} ({item.direction==="out"?"Đi":"Đến"}): {item.from||"—"} → {item.to||"—"} · {transferStatuses[item.status]}</Text>)}
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
  <Card style={{gap:12}}><Text style={{color:theme.text,fontWeight:"800",fontSize:20}}>Hợp đồng và thu chi</Text>{SHIFT_SUMMARY_FIELDS.map(([key,label,currency])=><Text key={key} style={{color:theme.text}}>{label}: {p.summary?.[key]==null?"Chưa ghi nhận":currency?money(p.summary[key]):p.summary[key]}</Text>)}</Card>
  <Card style={{gap:12}}><Text style={{color:theme.text,fontWeight:"800",fontSize:20}}>Tiền và an toàn</Text><Text style={{color:theme.text}}>Tiền mặt: {money(p.cash)}</Text><Text style={{color:theme.text}}>TK cá nhân: {money(p.personal)}</Text><Text style={{color:theme.text}}>TK Công ty: {money(p.company)}</Text><Text style={{color:theme.text}}>{p.electricity_off?"Đã xác nhận tắt thiết bị điện":"Chưa xác nhận tắt thiết bị điện"}</Text><Text style={{color:theme.muted,lineHeight:24}}>{p.electrical_devices||"Chưa ghi danh sách thiết bị"}</Text><Text selectable style={{color:theme.text,lineHeight:24}}>{p.notes||"Không có ghi chú"}</Text></Card>
  {p.ownership_report&&<>
    <Card style={{gap:8}}>
      <Text style={{color:theme.text,fontWeight:"800",fontSize:20}}>Đối chiếu tài khoản thuê sở hữu</Text>
      <Text style={{color:theme.text}}>TK THU: {money(p.ownership_report.values.thu_actual)} · App {money(p.ownership_report.thu_balance)} ({reconciliation(p.ownership_report.values.thu_actual,p.ownership_report.thu_balance)})</Text>
      <Text style={{color:theme.text}}>TK CTY: {money(p.ownership_report.values.company_actual)} · App {money(p.ownership_report.company_balance)} ({reconciliation(p.ownership_report.values.company_actual,p.ownership_report.company_balance)})</Text>
      <Text style={{color:theme.text}}>Sổ thu trong ngày: {money(p.ownership_report.values.book_income)} · App {money(p.ownership_report.app.income_day)} ({reconciliation(p.ownership_report.values.book_income,p.ownership_report.app.income_day)})</Text>
    </Card>
    {OWNERSHIP_REPORT_GROUPS.map(group=><Card key={group.title} style={{gap:10}}><Text style={{color:theme.text,fontWeight:"800",fontSize:20}}>{group.title}</Text>{group.fields.map(([key,label])=><Text key={key} style={{color:theme.text,lineHeight:24}}>{label}: {p.ownership_report!.values[key]===null?"Chưa ghi nhận":p.ownership_report!.values[key]?.toLocaleString("vi-VN")} (App: {p.ownership_report!.app[key]===null?"Chưa có nguồn":p.ownership_report!.app[key]?.toLocaleString("vi-VN")})</Text>)}</Card>)}
  </>}
  </>;
}
