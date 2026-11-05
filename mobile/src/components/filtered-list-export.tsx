import {Text,View} from 'react-native';
import {usePreventRemove} from 'expo-router';
import type {MobileListExportKind} from '../../../shared/mobile-list-export';
import {useSession} from '@/providers/session';
import {useCsvExport} from '@/hooks/use-csv-export';
import {useTheme} from '@/theme';
import {Button,InlineError} from './ui';

type Props={kind:MobileListExportKind;filters:string;disabled:boolean;limitText?:string};
export function FilteredListExport({kind,filters,disabled,limitText}:Props) {
  const {api,session}=useSession();
  return <Exporter key={`${api?.origin}:${session?.token}:${session?.user.storeId}:${session?.user.allStores}:${session?.user.permissions.join(',')}:${kind}:${filters}`} kind={kind} filters={filters} disabled={disabled} limitText={limitText}/>;
}
function Exporter({kind,filters,disabled,limitText}:Props) {
  const {api}=useSession(),output=useCsvExport(),theme=useTheme();
  usePreventRemove(output.busy,()=>{});
  return <View style={{gap:8}}>
    <Button secondary label={output.stage==='fetching'?'Đang tạo Excel từ toàn bộ kết quả':output.stage==='saving'?'Đang lưu / chia sẻ Excel':'Tải Excel theo bộ lọc'} loading={output.busy} disabled={disabled||!api} onPress={()=>void output.run(signal=>api!.listExcel(kind,filters,signal))}/>
    <Text style={{color:theme.muted,fontSize:13,lineHeight:19}}>{limitText||'Gồm các trang chưa tải, theo bộ lọc đang xem. File dùng cột và định dạng web.'}</Text>
    {!!output.error&&<InlineError message={output.error}/>}
    {!!output.message&&<Text accessibilityLiveRegion="polite" style={{color:theme.text,lineHeight:22}}>{output.message}</Text>}
  </View>;
}
