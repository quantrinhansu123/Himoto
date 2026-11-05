import {useEffect,useRef,useState} from 'react';
import {ScrollView,Text} from 'react-native';
import {router,useLocalSearchParams} from 'expo-router';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {isMobileBulkKind,bulkDeleteOperation,MOBILE_BULK_LABELS,type MobileBulkKind} from '../../../../shared/mobile-bulk-delete';
import {useSession} from '@/providers/session';
import {pendingWrites} from '@/lib/pending-writes';
import {useTheme} from '@/theme';
import {Button,Card,InlineError,StateView} from '@/components/ui';
function Result({requestKey,kind}:{requestKey:string;kind:MobileBulkKind}){
  const{api,session}=useSession(),theme=useTheme(),cache=useQueryClient(),[busy,setBusy]=useState(false),[cancelled,setCancelled]=useState(false),[error,setError]=useState(''),alive=useRef(true),running=useRef(false);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
  const operation=bulkDeleteOperation(kind),query=useQuery({queryKey:['bulk-delete-result',api!.origin,session!.user.id,requestKey,kind],queryFn:async({signal})=>{const proof=await api!.bulkDeletion(requestKey,signal);if(proof.kind!==kind)throw Error('Xác nhận không khớp danh mục xóa. Giữ mã gốc.');return proof;},retry:false});
  async function resolve(){if(running.current)return;running.current=true;setBusy(true);setError('');try{const result=await api!.resolveWrite(requestKey,operation);if(!alive.current)return;if(result.status==='cancelled')setCancelled(true);else await query.refetch({throwOnError:true});}catch(cause){if(alive.current)setError((cause as Error).message);}finally{running.current=false;if(alive.current)setBusy(false);}}
  async function ack(){if(running.current||!cancelled&&!query.data)return;running.current=true;setBusy(true);setError('');try{const scope={origin:api!.origin,userId:session!.user.id,storeId:session!.user.allStores?null:session!.user.storeId,allStores:session!.user.allStores},owner=await pendingWrites.entryScope(scope,operation,requestKey);if(!alive.current)return;if(owner)await pendingWrites.complete(owner,operation,requestKey);if(!alive.current)return;for(const queryKey of [['directory'],['catalogue'],['store-profile'],['staff-profile'],['vehicle-profile'],['customer-profile'],['store-contracts'],['staff-organization'],['workspace'],['overview']])void cache.invalidateQueries({queryKey});if(kind==='staff'||kind==='stores')router.replace({pathname:'/directory/[kind]',params:{kind}});else router.replace(kind==='vehicles'?'/(tabs)/vehicles':'/(tabs)/customers');}catch(cause){if(alive.current)setError((cause as Error).message);}finally{running.current=false;if(alive.current)setBusy(false);}}
  return <ScrollView contentContainerStyle={{padding:20,paddingBottom:40,gap:16,maxWidth:760,width:'100%',alignSelf:'center'}}><Card style={{gap:14}}><Text accessibilityRole="header" style={{color:query.data?theme.success:theme.text,fontSize:24,fontWeight:'800'}}>{cancelled?'Đã xác nhận chưa xóa':query.data?`Đã xóa ${query.data.deletedCount} ${MOBILE_BULK_LABELS[kind]}`:'Đối chiếu yêu cầu xóa'}</Text><Text selectable style={{color:theme.muted,lineHeight:24}}>Mã yêu cầu: {requestKey}</Text><Text style={{color:theme.text,lineHeight:24}}>{cancelled?'Mã gốc đã được hủy, không thể ghi trễ. Tải lại danh sách và rà soát lại trước lượt mới.':query.data?'Đây là xác nhận của lượt xóa gốc. Gửi lại cùng mã không xóa thêm hồ sơ.':'Giữ mã gốc để kiểm tra kết quả trước khi tạo lượt mới.'}</Text></Card>
    {!cancelled&&query.isPending&&<StateView title="Đang đọc xác nhận xóa" loading/>}
    {!cancelled&&query.isError&&<><InlineError message={query.error.message}/><Button secondary label="Đọc lại xác nhận xóa" disabled={busy} onPress={()=>void query.refetch()}/><Button label="Đối chiếu và chặn yêu cầu xóa đến trễ" loading={busy} onPress={()=>void resolve()}/></>}
    {!!error&&<InlineError message={error}/>}
    {(cancelled||query.data)&&<Button label="Đã kiểm tra kết quả xóa" loading={busy} onPress={()=>void ack()}/>}
  </ScrollView>;
}
export default function Screen(){const{key,kind}=useLocalSearchParams<{key:string;kind:string}>(),{api,session}=useSession();if(!api||!session||!isMobileBulkKind(kind)||!/^[a-f0-9-]{36}$/.test(key))return <StateView title="Không tìm thấy yêu cầu xóa"/>;return <Result key={[api.origin,session.token,session.user.storeId,session.user.allStores,key,kind].join('|')} requestKey={key} kind={kind}/>;}
