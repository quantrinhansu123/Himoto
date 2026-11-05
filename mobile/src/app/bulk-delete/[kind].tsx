import {useEffect,useRef,useState} from 'react';
import {FlatList,Pressable,Text,View} from 'react-native';
import {router,useLocalSearchParams,usePreventRemove} from 'expo-router';
import {uuid} from 'expo';
import {useQuery} from '@tanstack/react-query';
import {isMobileBulkKind,MOBILE_BULK_LABELS,bulkDeleteOperation,type MobileBulkKind,type MobileBulkReview} from '../../../../shared/mobile-bulk-delete';
import {useSession} from '@/providers/session';
import {pendingWrites} from '@/lib/pending-writes';
import {useTheme} from '@/theme';
import {Button,Card,InlineError,StateView,StatusBadge} from '@/components/ui';
import {FormField} from '@/components/form-fields';
import {ConfirmEdit} from '@/components/editor-sheet';
type Row={id:number;code:string;name:string;status:string;storeName:string};
function Bulk({kind,filters}:{kind:MobileBulkKind;filters:string}){
  const{api,session}=useSession(),theme=useTheme(),[page,setPage]=useState(1),[selected,setSelected]=useState<Record<number,Row>>({}),[review,setReview]=useState<MobileBulkReview|null>(null),[confirm,setConfirm]=useState(''),[busy,setBusy]=useState(false),[pending,setPending]=useState(false),[error,setError]=useState(''),[exit,setExit]=useState<(()=>void)|null>(null),running=useRef(false),alive=useRef(true);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
  const disable=usePreventRemove(Object.keys(selected).length>0||busy||pending,({repeat})=>setExit(()=>repeat));
  const allowed=session!.user.permissions.includes(kind==='staff'?'hr.write':'settings.write');
  const query=useQuery({queryKey:['bulk-selection',api!.origin,session!.user.id,session!.user.storeId,session!.user.allStores,kind,filters,page],queryFn:async({signal})=>{const params=new URLSearchParams(filters);params.set('page',String(page));params.set('size','50');return kind==='staff'||kind==='stores'?api!.directory(kind,params.toString(),signal):api!.catalogue(kind,params.toString(),signal);},enabled:allowed,retry:false});
  const count=Object.keys(selected).length,locked=busy||pending;
  function toggle(row:Row){if(locked||review)return;setSelected(current=>{const next={...current};if(next[row.id])delete next[row.id];else if(Object.keys(next).length<500)next[row.id]=row;return next;});}
  async function prepare(){if(running.current||locked||!count)return;running.current=true;setBusy(true);setError('');try{const next=await api!.bulkDeleteReview(kind,Object.keys(selected).map(Number));if(alive.current){setReview(next);setConfirm('');}}catch(cause){if(alive.current)setError((cause as Error).message);}finally{running.current=false;if(alive.current)setBusy(false);}}
  async function remove(){if(running.current||locked||!review||confirm.trim().toUpperCase()!=='XOA')return;running.current=true;setBusy(true);setError('');try{
    const scope={origin:api!.origin,userId:session!.user.id,storeId:session!.user.allStores?null:session!.user.storeId,allStores:session!.user.allStores},operation=bulkDeleteOperation(kind);
    const intent=await pendingWrites.reserveExclusive(scope,operation,[operation],()=>uuid.v4().toLowerCase());if(!alive.current)return;setPending(true);
    if(!intent.created)throw Error('Còn yêu cầu chưa rõ kết quả. Mở Tài khoản để đối chiếu mã gốc trước khi xóa.');
    await api!.bulkDelete(review,intent.key);if(!alive.current)return;disable();router.replace({pathname:'/bulk-delete-result/[key]',params:{key:intent.key,kind}});
  }catch(cause){if(alive.current)setError((cause as Error).message);}finally{running.current=false;if(alive.current)setBusy(false);}}
  if(!allowed)return <StateView title="Không có quyền xóa danh sách này"/>;
  return <>
    <FlatList data={review?review.rows:query.data?.rows||[]} keyExtractor={r=>String(r.id)} keyboardShouldPersistTaps="handled" contentContainerStyle={{padding:20,paddingBottom:40,gap:14,maxWidth:760,width:'100%',alignSelf:'center'}}
      ListHeaderComponent={<View style={{gap:16}}><Text accessibilityRole="header" style={{color:theme.text,fontSize:25,fontWeight:'800'}}>{review?'Rà soát xóa':'Chọn nhiều'} {MOBILE_BULK_LABELS[kind]}</Text>
        <Text style={{color:theme.muted,lineHeight:24}}>Chọn tối đa 500 hồ sơ, có thể qua nhiều trang. Nếu một hồ sơ còn dữ liệu liên quan, toàn bộ lượt xóa bị hủy.</Text>
        {kind==='staff'&&<Text style={{color:theme.muted,lineHeight:24}}>Xóa hồ sơ không khóa tài khoản đăng nhập. Để dừng quyền truy cập và giữ lịch sử, mở hồ sơ rồi chọn Đã nghỉ việc.</Text>}
        {review?<><Card style={{gap:12}}><Text style={{color:theme.danger,fontSize:18,fontWeight:'700'}}>Xóa vĩnh viễn {review.rows.length} {MOBILE_BULK_LABELS[kind]}</Text><Text style={{color:theme.text,lineHeight:24}}>Kiểm tra các hồ sơ bên dưới. Nhập XOA để xác nhận đúng danh sách này.</Text><FormField label="Nhập XOA để xác nhận" value={confirm} onChangeText={setConfirm} editable={!locked} autoCapitalize="characters" maxLength={3}/></Card><Button label={`Xác nhận xóa ${review.rows.length} ${MOBILE_BULK_LABELS[kind]}`} loading={busy} disabled={locked||confirm.trim().toUpperCase()!=='XOA'} onPress={()=>void remove()}/><Button secondary label="Quay lại chọn hồ sơ" disabled={locked} onPress={()=>{setReview(null);setConfirm('');setError('');}}/></>:<>
          <Text accessibilityLiveRegion="polite" style={{color:theme.text,fontSize:18,fontWeight:'700'}}>Đã chọn {count}/500</Text>
          <Button label={`Rà soát xóa ${count} hồ sơ`} disabled={locked||!count} loading={busy} onPress={()=>void prepare()}/>
          <Button secondary label="Chọn các hồ sơ trang này" disabled={locked||!query.data?.rows.length} onPress={()=>setSelected(current=>{const next={...current};for(const row of query.data!.rows)if(Object.keys(next).length<500||next[row.id])next[row.id]={id:row.id,code:row.code,name:row.name,status:row.status,storeName:row.storeName};return next;})}/>
          <Button secondary label="Bỏ toàn bộ lựa chọn" disabled={locked||!count} onPress={()=>setSelected({})}/>
          {query.data&&<Text style={{color:theme.muted}}>{query.data.total} hồ sơ theo bộ lọc · Trang {query.data.page}/{query.data.pages}</Text>}
        </>}
        {!!error&&<InlineError message={error}/>}
        {pending&&<Button secondary label="Mở Tài khoản để đối chiếu xóa" disabled={busy} onPress={()=>{disable();router.replace('/(tabs)/account');}}/>}
        {!review&&query.isPending&&<StateView title="Đang đọc danh sách chọn" loading/>}
        {!review&&query.isError&&<StateView title="Chưa đọc được danh sách chọn" message={query.error.message} retry={()=>void query.refetch()}/>}
      </View>}
      renderItem={({item})=><Pressable accessibilityRole={review?undefined:'checkbox'} accessibilityLabel={`${review?'Hồ sơ':'Chọn'} ${item.code} ${item.name}`} accessibilityState={review?{disabled:locked}:{checked:!!selected[item.id],disabled:locked||!selected[item.id]&&count>=500}} aria-checked={review?undefined:!!selected[item.id]} disabled={locked||!!review||!selected[item.id]&&count>=500} onPress={()=>toggle(item)} style={({pressed})=>({opacity:pressed?0.7:1})}><Card style={{gap:10,borderColor:!review&&selected[item.id]?theme.primary:theme.controlBorder}}><Text style={{color:theme.text,fontSize:18,fontWeight:'700'}}>{!review?(selected[item.id]?'Đã chọn · ':'Chưa chọn · '):''}{item.code} · {item.name}</Text>{!!item.storeName&&<Text style={{color:theme.muted}}>{kind==='vehicles'?'Cơ sở sở hữu':'Cơ sở'}: {item.storeName}</Text>}<StatusBadge status={item.status}/></Card></Pressable>}
      ListFooterComponent={!review&&query.data?<View style={{gap:12}}><Button secondary label="Trang chọn hồ sơ trước" disabled={locked||query.isFetching||query.data.page<=1} onPress={()=>setPage(query.data.page-1)}/><Button secondary label="Trang chọn hồ sơ tiếp" disabled={locked||query.isFetching||query.data.page>=query.data.pages} onPress={()=>setPage(query.data.page+1)}/></View>:undefined}/>
    {exit&&<ConfirmEdit title="Rời danh sách xóa?" message={pending?'Yêu cầu đã gửi giữ mã gốc trong Tài khoản. Đối chiếu trước khi gửi thêm.':'Các lựa chọn chưa gửi sẽ bị bỏ.'} confirmLabel="Rời danh sách" busy={busy} onCancel={()=>setExit(null)} onConfirm={()=>{if(busy)return;const leave=exit;setExit(null);disable();leave();}}/>}
  </>;
}
export default function Screen(){const{kind,filters=''}=useLocalSearchParams<{kind:string;filters?:string}>(),{api,session}=useSession();if(!api||!session||!isMobileBulkKind(kind)||filters.length>2000)return <StateView title="Không tìm thấy danh sách xóa"/>;return <Bulk key={[api.origin,session.token,session.user.storeId,session.user.allStores,kind,filters].join('|')} kind={kind} filters={filters}/>;}
