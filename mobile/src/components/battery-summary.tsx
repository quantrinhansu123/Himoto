import { Text, View } from "react-native";
import { batteryStatusLabel,type BatteryContract } from "../../../shared/mobile-battery";
import { useTheme,money } from "@/theme";
import { Card, KeyValueRow, StatusBadge } from "./ui";
export function BatterySummary({record:r}:{record:BatteryContract}){
  const theme=useTheme();
  return <>
    <Card style={{gap:6,padding:14}}>
      <View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center',gap:8}}>
        <Text accessibilityRole="header" style={{color:theme.text,fontSize:18,fontWeight:'800',flex:1}}>{r.code}</Text>
        <StatusBadge status={r.status} label={batteryStatusLabel(r.status)}/>
      </View>
      <KeyValueRow label="Khách thuê" value={`${r.customer_name}${r.customer_phone?` · ${r.customer_phone}`:''}`} emphasize selectable/>
      <KeyValueRow label="Cơ sở / Nhân viên" value={`${r.store_name} · ${r.staff_name}`}/>
      <KeyValueRow label="Ngày / Nơi ký" value={`${r.signed_on.split('-').reverse().join('/')}${r.signed_place?` · ${r.signed_place}`:''}`}/>
    </Card>
    <Card style={{gap:6,padding:14}}>
      <Text style={{color:theme.text,fontSize:16,fontWeight:'800'}}>Pin / sạc và thời hạn</Text>
      <KeyValueRow label="Sản phẩm" value={r.battery_name} emphasize/>
      <KeyValueRow label="Thông tin xe" value={[r.vehicle_license,r.vehicle_brand,r.vehicle_type,r.vehicle_color,r.vehicle_year].filter(Boolean).join(' · ')||'Chưa ghi xe'}/>
      <KeyValueRow label="Bắt đầu" value={r.starts_at.replace('T',' ')}/>
      <KeyValueRow label="Kết thúc" value={r.ends_at.replace('T',' ')||'Chưa ghi'}/>
      <KeyValueRow label="Giá thuê" value={`${r.rent_price===null?'Chưa ghi':money(r.rent_price)} / ${r.price_unit}${r.package_name?` · ${r.package_name}`:''}`} emphasize/>
    </Card>
    <Card style={{gap:6,padding:14}}>
      <Text style={{color:theme.text,fontSize:16,fontWeight:'800'}}>Tiền và hồ sơ</Text>
      <KeyValueRow label="Thuê đã thu" value={`${r.paid_amount===null?'Chưa ghi':money(r.paid_amount)}${r.paid_method?` · ${r.paid_method}`:''}`} valueColor={theme.success} emphasize/>
      <KeyValueRow label="Cọc đã nhận" value={`${r.deposit_amount===null?'Chưa ghi':money(r.deposit_amount)}${r.deposit_method?` · ${r.deposit_method}`:''}`} emphasize/>
      {!!r.deposit_note&&<KeyValueRow label="Ghi chú cọc" value={r.deposit_note}/>}
      <KeyValueRow label="CCCD" value={`${r.customer_id_card||'Chưa ghi'}${r.id_card_issued_on?` · ${r.id_card_issued_on}`:''}${r.id_card_issued_by?` · ${r.id_card_issued_by}`:''}`} selectable/>
      <KeyValueRow label="Địa chỉ" value={r.customer_address||'Chưa ghi địa chỉ'} selectable/>
      {!!r.notes&&<KeyValueRow label="Ghi chú" value={r.notes} selectable/>}
    </Card>
  </>;
}
