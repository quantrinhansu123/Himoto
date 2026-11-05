import {useEffect,useRef,useState} from 'react';
import {Text} from 'react-native';
import type {ShiftReport} from '../../../shared/mobile-shift-reports';
import {mobileShiftAuditExport} from '../../../shared/mobile-shift-report-export';
import {useCsvExport} from '@/hooks/use-csv-export';
import {copyText} from '@/lib/copy-text';
import {useTheme} from '@/theme';
import {Button,Card,InlineError} from './ui';
export function ShiftAuditExport({report,disabled=false}:{report:ShiftReport;disabled?:boolean}){
  const theme=useTheme(),download=useCsvExport(),[open,setOpen]=useState(false),[copying,setCopying]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState(''),alive=useRef(true),running=useRef(false);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
  if(!report.audit)return null;
  const file=mobileShiftAuditExport(report),locked=disabled||copying||download.busy;
  async function copy(){if(running.current||locked)return;running.current=true;setCopying(true);setMessage('');setError('');try{await copyText(file.content);if(alive.current)setMessage('Đã chép đúng bản đối soát KTNB đã lưu.');}catch(cause){if(alive.current)setError((cause as Error).message);}finally{running.current=false;if(alive.current)setCopying(false);}}
  return <Card style={{gap:14}}><Text accessibilityRole="header" style={{color:theme.text,fontSize:20,fontWeight:'700'}}>Nội dung báo cáo KTNB</Text><Text style={{color:theme.muted,lineHeight:24}}>Dùng bản đã lưu · {report.audit.status==='confirmed'?'Đã xác nhận':'Nháp'} · Phiên bản {report.audit.revision}. Thay đổi đang nhập cần lưu trước khi chép hoặc xuất bản mới.</Text>
    <Button secondary label={open?'Ẩn nội dung báo cáo KTNB':'Xem nội dung báo cáo KTNB'} disabled={locked} onPress={()=>setOpen(!open)}/>
    {open&&<Text selectable style={{color:theme.text,fontSize:16,lineHeight:26}}>{file.content}</Text>}
    <Button secondary label="Chép báo cáo KTNB" loading={copying} disabled={locked} onPress={()=>void copy()}/>
    <Button secondary label="Xuất báo cáo KTNB dạng văn bản" disabled={locked} loading={download.busy} onPress={()=>void download.run(async()=>file)}/>
    {!!(error||download.error)&&<InlineError message={error||download.error}/>}
    {!!(message||download.message)&&<Text accessibilityLiveRegion="polite" style={{color:theme.muted,lineHeight:24}}>{message||download.message}</Text>}
  </Card>;
}
