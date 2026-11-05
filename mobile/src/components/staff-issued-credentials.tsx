import { useEffect,useRef,useState } from "react";
import { AppState,ScrollView, Share, Text } from "react-native";
import type { MobileStaffCredentials } from "../../../shared/mobile-staff";
import { useTheme } from "@/theme";
import { Button, Card, InlineError } from "./ui";
import { EditorSheet } from "./editor-sheet";
import { FormField } from "./form-fields";
import {copyText} from '@/lib/copy-text';
import {saveCsvFile} from '@/lib/save-csv-file';
export function StaffIssuedCredentials({ value, onClose }: { value: MobileStaffCredentials; onClose: () => void }) {
  const theme = useTheme(), [shown, setShown] = useState(false), [error, setError] = useState(""),[action,setAction]=useState<'copy'|'file'|''>(''),[message,setMessage]=useState(''),alive=useRef(true),running=useRef(false),busy=action!=='';
  useEffect(()=>{alive.current=true;const listener=AppState.addEventListener('change',state=>{if(state!=='active')setShown(false);});return()=>{alive.current=false;listener.remove();};},[]);
  const text=`Tài khoản: ${value.login_name}\nMật khẩu: ${value.password}\n${value.enabled?'Đã được phép đăng nhập.':'Chờ phân cơ sở hoặc mở quyền đăng nhập.'}`;
  async function handoff(file:boolean){if(running.current)return;running.current=true;setAction(file?'file':'copy');setError('');setMessage('');try{if(file)await saveCsvFile({filename:`himoto-tai-khoan-${value.login_name}.txt`,mimeType:'text/plain',content:text,rowCount:1},()=>alive.current);else await copyText(text);if(alive.current)setMessage(file?'Đã mở tệp để bàn giao.':'Đã chép thông tin vừa cấp.');}catch(cause){if(alive.current)setError((cause as Error).message);}finally{running.current=false;if(alive.current)setAction('');}}
  return <EditorSheet title="Tài khoản nhân sự vừa cấp" onClose={()=>{if(!busy)onClose();}}>
    <ScrollView contentContainerStyle={{ padding: 20, gap: 18 }}>
      <Text style={{ color: theme.text, lineHeight: 24 }}>Lưu thông tin để bàn giao cho nhân viên. Mật khẩu chỉ hiển thị ở lần cấp này; đóng màn hình hoặc ứng dụng sẽ không mở lại được từ xác nhận nhân sự.</Text>
      <Card style={{ gap: 16 }}>
        <FormField label="Tên đăng nhập vừa cấp" value={value.login_name} editable={false} autoComplete="off" />
        <FormField label="Mật khẩu đã sinh" value={value.password} editable={false} secureTextEntry={!shown} autoComplete="off" />
        <Button secondary label={shown ? "Ẩn mật khẩu vừa cấp" : "Hiện mật khẩu vừa cấp"} onPress={() => setShown(current => !current)} />
        <Text style={{ color: theme.muted, lineHeight: 22 }}>{value.enabled ? "Tài khoản đã được phép đăng nhập." : "Tài khoản đang khóa, chờ phân cơ sở hoặc mở quyền đăng nhập."}</Text>
      </Card>
      {!!error && <InlineError message={error} />}
      <Button secondary label="Chép thông tin tài khoản nhân sự vừa cấp" disabled={busy} loading={action==='copy'} onPress={()=>void handoff(false)}/>
      <Button secondary label="Tải tệp thông tin tài khoản nhân sự vừa cấp" disabled={busy} loading={action==='file'} onPress={()=>void handoff(true)}/>
      {!!message&&<Text accessibilityLiveRegion="polite" style={{color:theme.muted}}>{message}</Text>}
      <Button secondary label="Chia sẻ thông tin để bàn giao" onPress={() => { setError(""); void Share.share({ title: "Tài khoản nhân sự Himoto", message: `Tài khoản: ${value.login_name}\nMật khẩu: ${value.password}\n${value.enabled ? "Đã được phép đăng nhập." : "Chờ phân cơ sở hoặc mở quyền đăng nhập."}` }, { dialogTitle: "Bàn giao tài khoản nhân sự" }).catch(() => setError("Chưa mở được chia sẻ. Có thể hiện và chọn thông tin để sao chép trước khi đóng màn hình.")); }} />
      <Button label="Đóng thông tin và mở xác nhận nhân sự" disabled={busy} onPress={onClose} />
    </ScrollView>
  </EditorSheet>;
}
