import {useEffect,useMemo,useRef,useState} from 'react';
import {ScrollView,Text,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {router,usePreventRemove} from 'expo-router';
import {uuid} from 'expo';
import {useQuery} from '@tanstack/react-query';
import {isAdminAccount} from '../../../shared/mobile-managed-accounts';
import type {MobileContractWorkbook,MobileContractImportPreview} from '../../../shared/mobile-contract-import';
import {useSession} from '@/providers/session';
import {pendingWrites} from '@/lib/pending-writes';
import {pickWorkbook} from '@/lib/pick-workbook';
import {verifyContractImportBackup} from '@/lib/contract-import-backup';
import {useCsvExport} from '@/hooks/use-csv-export';
import {useTheme} from '@/theme';
import {Button,Card,InlineError,KeyValueRow,PaginationBar,StateView,StatusBadge} from '@/components/ui';
import {ChoiceField} from '@/components/form-fields';
import {ConfirmEdit} from '@/components/editor-sheet';

export default function Route(){const{api,session}=useSession();if(!api||!session||!isAdminAccount(session.user))return <StateView title="Chỉ quản trị viên được nhập nháp hợp đồng từ Excel"/>;return <Importer key={[api.origin,session.token,session.user.storeId,session.user.allStores].join('|')}/>;}
function Importer(){
  const {api,session}=useSession(),theme=useTheme(),download=useCsvExport();
  const scope=useMemo(()=>({origin:api!.origin,userId:session!.user.id,storeId:session!.user.allStores?null:session!.user.storeId,allStores:session!.user.allStores}),[api,session]);
  const backupScope={origin:api!.origin,actorId:session!.user.id};
  const [files,setFiles]=useState<MobileContractWorkbook[]>([]),[store,setStore]=useState(''),[preview,setPreview]=useState<MobileContractImportPreview|null>(null),[verified,setVerified]=useState(''),[busy,setBusy]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState(''),[confirm,setConfirm]=useState(false),[resolving,setResolving]=useState(false),[pending,setPending]=useState<{key:string;operation:string}|null>(null),[page,setPage]=useState(1),[filter,setFilter]=useState('all'),[leaving,setLeaving]=useState(false),[exit,setExit]=useState<(()=>void)|null>(null);
  const alive=useRef(true),running=useRef(false),abort=useRef<AbortController|null>(null);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;abort.current?.abort();};},[]);
  const disable=usePreventRemove(!leaving&&(!!busy||!!pending||files.length>0),({repeat})=>setExit(()=>repeat));
  const options=useQuery({queryKey:['contract-import-options',scope],queryFn:({signal})=>api!.contractImportOptions(signal),retry:false});
  const locked=!!busy||!!pending||download.busy,rows=preview?.plans.filter(p=>filter==='all'||p.state===filter)||[],pages=Math.max(1,Math.ceil(rows.length/25)),current=Math.min(page,pages);
  const text={color:theme.text,fontSize:16,lineHeight:25},muted={color:theme.muted,fontSize:15,lineHeight:24};
  function resetReview(){setPreview(null);setVerified('');setError('');setPage(1);setFilter('all');}
  async function addFile(){if(running.current||locked||!store)return;running.current=true;setBusy('Đang chọn và đọc file nguồn…');setError('');const controller=new AbortController();abort.current=controller;
    try{const file=await pickWorkbook();if(!file||!alive.current)return;if(files.some(f=>f.filename.toLocaleLowerCase('vi')===file.name.toLocaleLowerCase('vi')))throw Error('Tên file đã có trong danh sách. Bỏ file cũ trước khi chọn lại.');const parsed=await api!.contractImportWorkbook(file,Number(store),controller.signal);if(!alive.current)return;if(files.reduce((n,f)=>n+f.sources.length,0)+parsed.sources.length>1000)throw Error('Tổng các file vượt1000dòng. Chia thành các lô có nguồn riêng và kiểm tra lại.');setFiles(current=>[...current,parsed]);resetReview();}
    catch(cause){if(alive.current)setError((cause as Error).message);}finally{running.current=false;if(alive.current)setBusy('');}
  }
  async function prepare(){if(running.current||locked||!files.length)return;running.current=true;setBusy('Đang đối chiếu khách, xe và hợp đồng…');resetReview();const controller=new AbortController();abort.current=controller;
    try{const value=await api!.contractImportPreview(files,controller.signal);if(alive.current)setPreview(value);}catch(cause){if(alive.current)setError((cause as Error).message);}finally{running.current=false;if(alive.current)setBusy('');}
  }
  async function backup(){if(running.current||locked||!preview)return;running.current=true;setBusy('Đang lưu và đọc lại bản sao lưu…');setError('');try{const hash=await verifyContractImportBackup(backupScope,preview);if(alive.current)setVerified(hash);}catch(cause){if(alive.current)setError((cause as Error).message);}finally{running.current=false;if(alive.current)setBusy('');}}
  function openResult(key:string){setLeaving(true);disable();router.replace({pathname:'/import-result/[key]',params:{key}});}
  async function save(){setConfirm(false);if(running.current||locked||!preview||verified!==preview.backupSha)return;running.current=true;setBusy('Đang xác minh bản sao lưu và nhập nháp…');setError('');
    try{
      const verifiedBackupSha=await verifyContractImportBackup(backupScope,preview);if(!alive.current)return;
      const operation=`import.contracts:${preview.batchId}`,old=(await pendingWrites.list(scope,true)).filter(p=>p.operation.startsWith('import.')).map(p=>p.operation),intent=await pendingWrites.reserveExclusive(scope,operation,[operation,...old],()=>uuid.v4().toLowerCase());
      if(!alive.current)return;if(intent.operation!==operation)throw Error('Còn lần nhập Excel chưa đối chiếu. Mở Tài khoản để xử lý mã gốc.');setPending({key:intent.key,operation});if(!intent.created)throw Error('Giữ mã nhập cũ để đối chiếu trước khi gửi lại.');
      const value=await api!.importContracts({files,batchId:preview.batchId,revision:preview.revision,expectedAdded:preview.expectedAdded,backupSha:preview.backupSha,backupSnapshotSha:preview.backupSnapshotSha,manifestSha:preview.manifestSha,signature:preview.signature,verifiedBackupSha},intent.key);
      if(!alive.current)return;if(value.actorId!==scope.userId)throw Error('Xác nhận nhập không khớp tài khoản. Giữ mã gốc.');openResult(intent.key);
    }catch(cause){if(alive.current)setError((cause as Error).message);}finally{running.current=false;if(alive.current)setBusy('');}
  }
  async function resolve(){setResolving(false);if(running.current||!pending)return;running.current=true;setBusy('Đang đối chiếu lần nhập…');setError('');try{const result=await api!.resolveWrite(pending.key,pending.operation);if(!alive.current)return;if(result.status==='committed'){openResult(pending.key);return;}await pendingWrites.complete(scope,pending.operation,pending.key);if(!alive.current)return;setPending(null);resetReview();setNotice('Máy chủ xác nhận chưa nhập và đã khóa mã cũ. Các file vẫn được giữ; xem trước và sao lưu lại trước khi gửi.');}catch(cause){if(alive.current)setError((cause as Error).message);}finally{running.current=false;if(alive.current)setBusy('');}}
  return <SafeAreaView edges={['left','right','bottom']} style={{flex:1,backgroundColor:theme.background}}><ScrollView contentContainerStyle={{padding:16,paddingBottom:40,gap:14,maxWidth:760,width:'100%',alignSelf:'center'}}>
    <Card style={{gap:8}}><Text style={text}>Chỉ tạo nháp từ file đơn thuê đang thuê theo mẫu 12 cột. Sau nhập cần mở từng nháp để đối soát và phát hành.</Text><Text style={muted}>Tiền nguồn được giữ để đối chiếu; chưa ghi nhận thu tiền, phiếu hoặc thay đổi kho. Dòng trùng và dòng bị chặn không được nhập lại.</Text></Card>
    <Text style={muted}>Cột “Đặt cọc” của file cũ là tổng đã thu theo nguồn, chỉ giữ để đối chiếu. Chưa ghi nhận tiền cọc. Ngày giờ Việt Nam: YYYY-MM-DD HH:mm:ss; SĐT giữ số 0 đầu; trạng thái nguồn phải là renting.</Text>
    {!!(error||download.error)&&<InlineError message={error||download.error}/>}
    {!!notice&&<Text style={muted}>{notice}</Text>}{!!download.message&&<Text style={muted}>{download.message}</Text>}
    {!!busy&&<Text accessibilityLiveRegion="polite" style={text}>{busy}</Text>}
    {pending?<Card style={{gap:14}}><Text style={text}>Lần nhập đang chờ đối chiếu. Giữ mã gốc trước khi gửi thêm.</Text><Button label="Đối chiếu nhập nháp hợp đồng" loading={!!busy} onPress={()=>setResolving(true)}/><Button label="Mở xác nhận nhập nháp" secondary disabled={!!busy} onPress={()=>openResult(pending.key)}/></Card>:<>
      <Button label="Tải mẫu Excel hợp đồng 12 cột" secondary disabled={locked} onPress={()=>void download.run(signal=>api!.contractImportTemplate(signal))}/>
      {options.isPending&&<Text style={muted}>Đang đọc cơ sở nguồn…</Text>}{options.isError&&<StateView title="Chưa đọc được cơ sở" message={options.error.message} retry={()=>void options.refetch()}/>}
      {options.data&&<><ChoiceField label="Cơ sở nguồn của file sẽ thêm" value={store} choices={[{value:'',label:'Chọn cơ sở nguồn'},...options.data.stores.map(s=>({value:String(s.id),label:s.name}))]} disabled={locked} searchable onChange={setStore}/><Button label="Thêm file hợp đồng Excel" secondary disabled={locked||!store||files.length>=20} onPress={()=>void addFile()}/></>}
      {files.map((file,index)=><Card key={file.filename} style={{gap:8}}><Text style={{...text,fontWeight:'700'}}>{index+1}. {file.filename}</Text><KeyValueRow label="Số dòng & cơ sở nguồn" value={`${file.sources.length} dòng · ${options.data?.stores.find(s=>s.id===file.storeId)?.name||`Cơ sở #${file.storeId}`}`}/><Text style={muted}>Muốn đổi cơ sở nguồn: bỏ file này rồi thêm lại với cơ sở đúng.</Text><Button size="sm" secondary danger label={`Bỏ file ${file.filename}`} disabled={locked} onPress={()=>{setFiles(current=>current.filter(f=>f.filename!==file.filename));resetReview();}}/></Card>)}
      {!!files.length&&<Button label="Xem trước nháp sẽ nhập" disabled={locked} onPress={()=>void prepare()}/>}
      {preview&&<><Card style={{gap:8}}><Text style={{...text,fontSize:18,fontWeight:'800'}}>Kết quả đối chiếu</Text><View style={{gap:2}}><KeyValueRow label="Sẽ tạo nháp" value={`${preview.expectedAdded} nháp`} emphasize/><KeyValueRow label="Đã có trong hệ thống" value={String(preview.existing)}/><KeyValueRow label="Bị chặn" value={String(preview.blocked)}/></View><Text style={muted}>Dữ liệu thay đổi sau bước này sẽ buộc kiểm tra và sao lưu lại.</Text></Card>
        <ChoiceField label="Lọc kết quả nhập hợp đồng" value={filter} choices={[{value:'all',label:'Tất cả'},{value:'new',label:'Sẽ tạo nháp'},{value:'existing',label:'Đã có'},{value:'blocked',label:'Bị chặn'}]} disabled={locked} onChange={v=>{setFilter(v);setPage(1);}}/>
        {rows.slice((current-1)*25,current*25).map(plan=><Card key={plan.sourceId} style={{gap:8}}><View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center',gap:8}}><Text style={{...text,fontWeight:'700',flex:1}}>Đơn nguồn #{plan.sourceId} · {plan.customer}</Text><StatusBadge status={plan.state==='new'?'completed':plan.state==='existing'?'pending':'cancelled'} label={plan.state==='new'?'Sẽ tạo nháp':plan.state==='existing'?`Đã có #${plan.targetId}`:'Bị chặn'}/></View><KeyValueRow label="Biển số" value={plan.licenses.join(' · ')||'—'}/>{plan.errors.map((message,i)=><Text key={`e${i}`} style={{...muted,color:theme.danger}}>{message}</Text>)}{plan.warnings.map((message,i)=><Text key={`w${i}`} style={muted}>{message}</Text>)}</Card>)}
        {pages>1&&<PaginationBar page={current} pages={pages} total={rows.length} unit="dòng" disabled={locked} onChange={setPage}/>}
        <Card style={{gap:10}}><Text style={{...text,fontWeight:'700'}}>Sao lưu trước khi nhập</Text><Text style={muted}>{verified===preview.backupSha?'Bản sao lưu đã lưu và đọc lại xác minh đủ nội dung trên thiết bị này.':'Lưu và đọc lại bản sao lưu trước khi cho phép nhập. Giữ file này để đối chiếu sau bàn giao.'}</Text><View style={{flexDirection:'row',gap:8}}><Button size="sm" equalWidth label="Lưu & xác minh sao lưu" secondary disabled={locked} onPress={()=>void backup()}/><Button size="sm" equalWidth label="Xuất bản sao lưu" secondary disabled={locked||verified!==preview.backupSha} onPress={()=>void download.run(async()=>preview.backup)}/></View></Card>
        <Button label={`Rà soát nhập ${preview.expectedAdded} nháp hợp đồng`} disabled={locked||preview.expectedAdded<1||verified!==preview.backupSha} onPress={()=>setConfirm(true)}/>
      </>}
    </>}
    {!!error&&<Button label="Mở Tài khoản để đối chiếu" secondary disabled={!!busy} onPress={()=>router.push('/(tabs)/account')}/>}
    {confirm&&preview&&<ConfirmEdit title={`Nhập ${preview.expectedAdded} nháp hợp đồng?`} message={`Đã xác minh bản sao lưu. Sẽ tạo ${preview.expectedAdded} nháp; bỏ qua ${preview.existing} đơn đã có và ${preview.blocked} đơn bị chặn.\nNháp chưa đối soát tài chính; cần mở kiểm tra trước khi phát hành. Máy chủ kiểm lại toàn bộ revision và số lượng trước khi ghi.`} confirmLabel="Xác nhận nhập nháp hợp đồng" onCancel={()=>setConfirm(false)} onConfirm={()=>void save()}/>}
    {resolving&&<ConfirmEdit title="Đối chiếu lần nhập nháp?" message="Nếu đã nhập, đọc xác nhận gốc. Nếu chưa nhập, khóa mã cũ. File đang chọn vẫn được giữ để kiểm tra lại." confirmLabel="Đối chiếu với máy chủ" onCancel={()=>setResolving(false)} onConfirm={()=>void resolve()}/>}
    {exit&&<ConfirmEdit title="Rời nhập hợp đồng?" busy={!!busy||download.busy} message="Các file chưa gửi sẽ cần chọn lại. Bản sao lưu đã xác minh được giữ trên thiết bị; mã đã gửi vẫn được giữ trong Tài khoản để đối chiếu." confirmLabel="Rời nhập hợp đồng" onCancel={()=>setExit(null)} onConfirm={()=>{const repeat=exit;setLeaving(true);disable();setExit(null);repeat();}}/>}
  </ScrollView></SafeAreaView>;
}
