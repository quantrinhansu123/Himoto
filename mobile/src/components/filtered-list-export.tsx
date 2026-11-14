import type {MobileListExportKind} from '../../../shared/mobile-list-export';
import {useSession} from '@/providers/session';
import {FileExportButton} from './file-export-button';

type Props={kind:MobileListExportKind;filters:string;disabled:boolean;limitText?:string};
export function FilteredListExport({kind,filters,disabled,limitText}:Props) {
  const {api,session}=useSession();
  return <FileExportButton key={`${api?.origin}:${session?.token}:${session?.user.storeId}:${session?.user.allStores}:${session?.user.permissions.join(',')}:${kind}:${filters}`} load={signal=>api!.listExcel(kind,filters,signal)} disabled={disabled||!api} hint={limitText||'Gồm các trang chưa tải, theo bộ lọc đang xem. File dùng cột và định dạng web.'}/>;
}
