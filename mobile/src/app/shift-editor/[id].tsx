import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { useSession } from "@/providers/session";
import { StateView } from "@/components/ui";
import { ShiftEditor } from "@/components/shift-editor";
function Editor({id}:{id:string}) {
  const{api,session}=useSession(),allowed=session!.user.permissions.includes("contracts.read")&&session!.user.permissions.some(p=>p==="contracts.draft"||p==="finance.write");
  const options=useQuery({queryKey:["shift-options",session!.user.id],queryFn:({signal})=>api!.shiftOptions(signal),enabled:allowed});
  const record=useQuery({queryKey:["shift",session!.user.id,id],queryFn:({signal})=>api!.shift(id,signal),enabled:allowed&&id!=="new",retry:false});
  if(!allowed)return <StateView title="Không có quyền lập báo cáo ca" />;
  if(options.isError||id!=="new"&&record.isError)return <StateView title="Chưa mở được báo cáo ca" message={options.error?.message||record.error?.message} retry={()=>{void options.refetch();if(id!=="new")void record.refetch();}} />;
  if(options.isPending||id!=="new"&&record.isPending)return <StateView title="Đang mở biểu mẫu báo cáo ca" loading />;
  if(record.data?.status==="submitted")return <StateView title="Báo cáo PGD đã chốt" message="Số kiểm kê và minh chứng PGD được giữ nguyên. Mở phần đối soát KTNB để tiếp tục kiểm tra." />;
  return <ShiftEditor key={`${id}:${record.data?.revision||0}`} options={options.data} record={id==="new"?null:record.data!} />;
}
export default function Route(){const{id}=useLocalSearchParams<{id:string}>(),{api,session}=useSession();if(!api||!session||id!=="new"&&!/^[1-9]\d{0,14}$/.test(id))return <StateView title="Không mở được báo cáo ca" />;return <Editor key={`${id}:${api.origin}:${session.token}:${session.user.storeId}:${session.user.allStores}:${session.user.permissions.join(",")}`} id={id} />;}
