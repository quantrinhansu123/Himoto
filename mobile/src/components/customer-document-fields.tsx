import {useState} from 'react';
import {Platform,Text,View} from 'react-native';
import {useTheme} from '@/theme';
import type {useCustomerDocuments} from '@/hooks/use-customer-documents';
import {Button,Card,InlineError} from './ui';
import {BillPhoto} from './bill-photo';
import {ConfirmEdit} from './editor-sheet';
import {IdentityQrScanner} from './identity-qr-scanner';
import type {IdentityQrScan} from '../../../shared/identity-qr';

export function CustomerDocumentFields({documents,disabled,license=false,foreign=false}:{documents:ReturnType<typeof useCustomerDocuments>;disabled:boolean;license?:boolean;foreign?:boolean}){
  const theme=useTheme();const [removing,setRemoving]=useState<string|null>(null);
  const [scan,setScan]=useState<((scan:IdentityQrScan)=>void)|null>(null);
  const rows=documents.photos.filter(row=>license?row.slot.startsWith('driver_license'):!row.slot.startsWith('driver_license'));
  const controls=license?[['driver_license','GPLX']]:[['id_front',foreign?'trang hộ chiếu':'CCCD mặt trước'],['id_back',foreign?'trang bổ sung':'CCCD mặt sau']];
  const locked=disabled||documents.picking;
  return <View style={{gap:14}}>
    {!license&&<>
      <Text style={{color:theme.muted,fontSize:15,lineHeight:23}}>{foreign?'Chọn giấy tờ của cùng một khách. AI đọc tối đa 3 ảnh đầu; kiểm tra lại thông tin, địa chỉ nhập bằng tay.':'Quét QR căn cước để điền thông tin. Ảnh giấy tờ chỉ được gắn vào hồ sơ sau khi lưu khách; địa chỉ hiện tại nhập bằng tay.'}</Text>
      {!foreign&&<Button label="Quét QR căn cước" disabled={locked||documents.reading} onPress={()=>{const apply=documents.beginQr();setScan(()=>apply);}}/>}
      <Button secondary label={foreign?'Chọn nhiều ảnh · AI đọc cùng lúc':'Chọn nhiều ảnh giấy tờ'} disabled={locked||documents.reading} loading={documents.picking} onPress={()=>{void documents.pick('id_front',false,true);}}/>
      {!!documents.error&&<InlineError message={documents.error}/>}
      {!!documents.notice&&<Text accessibilityLiveRegion="polite" style={{color:theme.muted,fontSize:15,lineHeight:24}}>{documents.notice}</Text>}
      {documents.reading&&<Button secondary label="Bỏ qua AI" onPress={documents.skip}/>}
    </>}
    {controls.map(([slot,label])=><View key={slot} style={{gap:10}}>
      <Button secondary label={`Chọn ảnh ${label}`} disabled={locked||documents.reading} onPress={()=>{void documents.pick(slot);}}/>
      {Platform.OS!=='web'&&<Button secondary label={`Chụp ảnh ${label}`} disabled={locked||documents.reading} onPress={()=>{void documents.pick(slot,true);}}/>}
    </View>)}
    {rows.map((row,index)=><Card key={row.id} style={{gap:12}}>
      <Text style={{color:theme.text,fontSize:16,fontWeight:'700'}}>{license?'Giấy phép lái xe':row.slot.startsWith('id_front')?foreign?'Trang hộ chiếu':'CCCD mặt trước':foreign?'Trang bổ sung':'CCCD mặt sau'} · ảnh{index+1}</Text>
      <BillPhoto context="giấy tờ" source={{uri:row.photo.uri}} label={`Giấy tờ đang chọn ${row.slot}`}/>
      <Text style={{color:theme.muted,fontSize:14}}>{row.photo.width} × {row.photo.height} · {Math.ceil(row.photo.size/1024)} KB</Text>
      {(foreign||license)&&<Button secondary label={`Đọc lại ảnh ${row.slot}`} disabled={locked||documents.reading} onPress={()=>{void documents.read([row]);}}/>}
      <Button secondary label={`Bỏ ảnh ${row.slot}`} disabled={locked||documents.reading} onPress={()=>setRemoving(row.id)}/>
    </Card>)}
    {removing&&<ConfirmEdit title="Bỏ ảnh đang chọn?" message="Ảnh này sẽ không được gắn vào hồ sơ. Ảnh gốc trên thiết bị được giữ nguyên." confirmLabel="Bỏ ảnh này" onCancel={()=>setRemoving(null)} onConfirm={()=>{documents.remove(removing);setRemoving(null);}}/>}
    {!!scan&&!disabled&&<IdentityQrScanner onScan={scan} onClose={()=>setScan(null)}/>}
  </View>;
}
