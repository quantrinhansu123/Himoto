import {useState} from 'react';
import {Text,View} from 'react-native';
import type {MobileDraftVehicle} from '@himoto/mobile-contract';
import type {useContractPhotos} from '@/hooks/use-contract-photos';
import {contractDocumentSlots,contractPhotoSlots,contractPhotoLabel} from '../../../shared/contract-photos';
import {photoBaseSlot} from '../../../shared/photo-slot-groups';
import {pendingContractPhotoLabel} from '@/lib/contract-photo-label';
import {useTheme} from '@/theme';
import {Button,Card,InlineError} from './ui';
import {BillPhoto} from './bill-photo';
import {ChoiceField} from './form-fields';
import {ConfirmEdit} from './editor-sheet';
export function ContractPhotoFields({photos,vehicles,disabled,plates=false,canOcr}:{photos:ReturnType<typeof useContractPhotos>;vehicles:MobileDraftVehicle[];disabled:boolean;plates?:boolean;canOcr:boolean}) {
  const theme=useTheme(),[slot,setSlot]=useState('rental-document-1'),[removing,setRemoving]=useState<string|null>(null);
  const locked=disabled||photos.picking;
  const rows=photos.photos.filter(p=>plates?/^(?:plate-|scan_plate)/.test(p.slot):!(/^(?:plate-|scan_plate)/.test(p.slot)));
  const choices=plates?[{value:'scan_plate',label:'Quét ảnh để tìm xe'},...vehicles.filter(v=>v.id).map(v=>({value:`plate-${v.id}`,label:`Biển số ${v.license||v.name}`}))]:
    [...contractDocumentSlots('rental'),{key:'driver-license',label:'GPLX chụp khi lập hợp đồng'},...contractPhotoSlots('rental'),...contractPhotoSlots('handover')].filter(s=>!s.key.includes('-video-')).map(s=>({value:s.key,label:contractPhotoLabel(s.key)}));
  const selected=plates?(choices.some(s=>s.value===slot)?slot:'scan_plate'):slot;
  const canSelect=!plates||selected!=='scan_plate'||vehicles.some(v=>!v.id);
  return <View style={{gap:14}}>
    <Text accessibilityRole="header" style={{color:theme.text,fontSize:18,fontWeight:'700'}}>{plates?'Ảnh biển số theo từng xe':'Ảnh lập hợp đồng / giao xe'}</Text>
    <Text style={{color:theme.muted,fontSize:14,lineHeight:22}}>{plates?'Quét biển số chỉ chọn khi kho có đúng một xe khớp. Ảnh chưa đối chiếu vẫn được giữ.':'Ảnh được giữ trong form; sau khi lưu nháp sẽ rà soát đúng ID hợp đồng rồi tải lần lượt. Ảnh lỗi không tạo thêm bản nháp.'}</Text>
    <ChoiceField label={plates?'Mục ảnh biển số':'Mục ảnh hợp đồng'} value={selected} choices={choices} onChange={setSlot} disabled={locked} searchable/>
    {!canSelect&&<Text style={{color:theme.warning}}>Thêm dòng xe trống trước khi quét để chọn xe mới, hoặc chọn xe đã có để đối chiếu ảnh.</Text>}
    <Button label={plates?'Chọn ảnh biển số':'Chọn ảnh hợp đồng'} secondary disabled={locked||!canSelect} onPress={()=>void photos.pick(selected)}/>
    <Button label={plates?'Chụp ảnh biển số':'Chụp ảnh hợp đồng'} secondary disabled={locked||!canSelect} onPress={()=>void photos.pick(selected,true)}/>
    {!!photos.error&&<InlineError message={photos.error}/>}{!!photos.notice&&<Text accessibilityLiveRegion="polite" style={{color:theme.muted,lineHeight:22}}>{photos.notice}</Text>}
    {photos.reading&&<Button label="Bỏ qua đọc biển số" secondary onPress={photos.skip}/>}
    {rows.map((row,index)=>{const label=pendingContractPhotoLabel(row.slot,vehicles);return <Card key={row.id} style={{gap:12}}>
      <Text style={{color:theme.text,fontWeight:'600'}}>{label}</Text>
      <BillPhoto context="hợp đồng" source={{uri:row.photo.uri}} label={`Ảnh đang chọn · ${label}`}/>
      <Text style={{color:theme.muted}}>{row.photo.width} × {row.photo.height} · {Math.ceil(row.photo.size/1024)} KB</Text>
      {plates&&<ChoiceField label={`Gắn xe cho ảnh ${index+1}`} value={photoBaseSlot(row.slot).replace('plate-','')} choices={vehicles.filter(v=>v.id).map(v=>({value:v.id,label:v.license||v.name}))} disabled={locked||photos.reading} onChange={id=>photos.bind(row.id,id)}/>}
      {plates&&canOcr&&<Button label={`Đọc lại biển số · ${label}`} secondary disabled={locked||photos.reading} onPress={()=>void photos.read(row)}/>}
      <Button label={`Bỏ ảnh đang chọn · ${label}`} secondary disabled={locked||photos.reading} onPress={()=>setRemoving(row.id)}/>
    </Card>;})}
    {removing&&<ConfirmEdit title="Bỏ ảnh khỏi bản nháp?" message="Ảnh chưa tải sẽ được bỏ khỏi form. Ảnh gốc trên điện thoại được giữ." confirmLabel="Bỏ ảnh này" onCancel={()=>setRemoving(null)} onConfirm={()=>{photos.remove(removing);setRemoving(null);}}/>}
  </View>;
}
