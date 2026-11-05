import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {ScrollView,Text,View} from 'react-native';
import {router,useFocusEffect} from 'expo-router';
import {useQueryClient} from '@tanstack/react-query';
import {SafeAreaView} from 'react-native-safe-area-context';
import type {MobileReturnReceipt} from '../../../shared/mobile-return-write';
import {useSession} from '@/providers/session';
import {pendingWrites} from '@/lib/pending-writes';
import {dateTime,money,useTheme} from '@/theme';
import {Button,Card,InlineError,StateView} from './ui';
import {ConfirmEdit} from './editor-sheet';

const kindLabel={late_fee:'Thu phí trễ',repair_fee:'Thu sửa chữa',rental_debt:'Thu công nợ',rental_refund:'Hoàn tiền thuê',deposit_refund:'Hoàn cọc'};
export function ReturnRecovery({id}:{id:string}) {
  const {api,session}=useSession();
  if(!/^[1-9]\d{0,14}$/.test(id)||!api||!session||!session.user.permissions.includes('contracts.read')||!session.user.permissions.includes('contracts.return'))
    return <StateView title="Không mở được trả xe" message="Tài khoản cần quyền xem hợp đồng và trả/đổi xe."/>;
  return <Recovery key={[api.origin,session.token,session.user.storeId,session.user.allStores,session.user.permissions.join(','),id].join(':')} id={id}/>;
}
function Recovery({id}:{id:string}) {
  const {api,session}=useSession(),theme=useTheme(),cache=useQueryClient();
  const scope=useMemo(()=>({origin:api!.origin,userId:session!.user.id,storeId:session!.user.allStores?null:session!.user.storeId,allStores:session!.user.allStores}),[api,session]);
  const operation='return.record:'+id;
  const [key,setKey]=useState<string|null>(null),[receipt,setReceipt]=useState<MobileReturnReceipt|null>(null);
  const [busy,setBusy]=useState(true),[error,setError]=useState(''),[notice,setNotice]=useState(''),[confirm,setConfirm]=useState(false);
  const alive=useRef(false),running=useRef(false),epoch=useRef(0);
  const load=useCallback(async()=>{
    if(!api||running.current)return;
    running.current=true;const current=++epoch.current;setBusy(true);setError('');
    try{
      const pending=await pendingWrites.lookup(scope,operation);
      if(!alive.current||epoch.current!==current)return;
      setKey(pending);setReceipt(null);
      if(pending){
        const result=await api.returnReceipt(pending);
        if(!alive.current||epoch.current!==current)return;
        if(result.receipt&&String(result.receipt.id)!==id)throw Error('Phiếu trả xe không khớp hợp đồng. Giữ mã để đối chiếu.');
        setReceipt(result.receipt);
      }
    }catch(cause){if(alive.current&&epoch.current===current)setError((cause as Error).message);}
    finally{running.current=false;if(alive.current&&epoch.current===current)setBusy(false);}
  },[api,scope,operation,id]);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
  useFocusEffect(useCallback(()=>{void load();},[load]));
  async function resolve(){
    if(!api||!key||running.current)return;
    running.current=true;setBusy(true);setConfirm(false);setError('');
    const current=epoch.current;
    try{
      const result=await api.resolveWrite(key,operation);
      if(!alive.current||epoch.current!==current)return;
      if(result.status==='cancelled'){
        await pendingWrites.complete(scope,operation,key);
        if(!alive.current||epoch.current!==current)return;
        setKey(null);setReceipt(null);setNotice('Đã xác nhận chưa ghi trả xe và khóa mã cũ. Có thể mở lại hợp đồng để tiếp tục.');
      }else{
        const saved=await api.returnReceipt(key);
        if(!alive.current||epoch.current!==current)return;
        if(!saved.receipt||String(saved.receipt.id)!==id)throw Error('Chưa đọc được phiếu trả xe gốc. Giữ mã để đối chiếu.');
        setReceipt(saved.receipt);
      }
    }catch(cause){if(alive.current&&epoch.current===current)setError((cause as Error).message);}
    finally{running.current=false;if(alive.current&&epoch.current===current)setBusy(false);}
  }
  async function acknowledge(){
    if(!key||!receipt||receipt.requestId!==key||running.current)return;
    running.current=true;setBusy(true);setError('');const current=epoch.current;
    try{
      await pendingWrites.complete(scope,operation,key);
      if(!alive.current||epoch.current!==current)return;
      for(const queryKey of [['record'],['catalogue'],['overview'],['contract-finance'],['return-preparation']])void cache.invalidateQueries({queryKey});
      router.dismissTo({pathname:'/record/[kind]/[id]',params:{kind:'contracts',id}});
    }catch(cause){if(alive.current&&epoch.current===current)setError((cause as Error).message);}
    finally{running.current=false;if(alive.current&&epoch.current===current)setBusy(false);}
  }
  return <SafeAreaView edges={['left','right','bottom']} style={{flex:1,backgroundColor:theme.background}}>
    <ScrollView contentContainerStyle={{padding:20,gap:18,maxWidth:760,width:'100%',alignSelf:'center'}}>
      {!!error&&<InlineError message={error}/>}
      {!!notice&&<Text accessibilityLiveRegion="polite" style={{color:theme.text,fontSize:16,lineHeight:25}}>{notice}</Text>}
      {!receipt?<Card style={{gap:16}}>
        <Text accessibilityRole="header" style={{color:theme.text,fontSize:25,fontWeight:'800'}}>{key?'Trả xe đang chờ đối chiếu':'Đối chiếu trả xe'}</Text>
        <Text style={{color:theme.muted,fontSize:16,lineHeight:25}}>{key?'Giữ mã đến khi đã kiểm tra phiếu gốc hoặc máy chủ xác nhận chưa ghi.':'Không có yêu cầu trả xe chờ đối chiếu cho hợp đồng này.'}</Text>
        {key&&<Button label="Đối chiếu trả xe với máy chủ" loading={busy} onPress={()=>setConfirm(true)}/>}
        <Button label="Tải lại kết quả trả xe" secondary loading={busy} onPress={()=>{void load();}}/>
        {!key&&<Button label="Mở hợp đồng" secondary disabled={busy} onPress={()=>router.dismissTo({pathname:'/record/[kind]/[id]',params:{kind:'contracts',id}})}/>}
      </Card>:<>
        <Card style={{gap:16}}>
          <Text accessibilityRole="header" style={{color:theme.text,fontSize:25,fontWeight:'800'}}>Trả xe đã được ghi nhận</Text>
          <Text style={{color:theme.text,fontSize:19,fontWeight:'700'}}>{receipt.review.fees.code}</Text>
          <Text selectable style={{color:theme.muted,fontSize:15,lineHeight:24}}>Ghi lúc {dateTime(receipt.recordedAt)} · mã {receipt.requestId}</Text>
          {!receipt.current&&<InlineError message="Hồ sơ có thay đổi sau lần trả xe này. Đây là phiếu gốc; kiểm tra dữ liệu hiện tại trước khi thao tác tiếp."/>}
          {!receipt.itemsCurrent&&<Text style={{color:theme.warning,fontSize:15,lineHeight:24}}>Dòng xe đã thay đổi sau khi trả.</Text>}
          {!receipt.paymentsCurrent&&<Text style={{color:theme.warning,fontSize:15,lineHeight:24}}>Có phiếu thu/hoàn đã thay đổi hoặc bị hủy sau khi ghi.</Text>}
        </Card>
        <Card style={{gap:16}}>
          <Text accessibilityRole="header" style={{color:theme.text,fontSize:21,fontWeight:'700'}}>Xe đã nhận</Text>
          {receipt.review.fees.items.map(row=><View key={row.id} style={{gap:6}}>
            <Text style={{color:theme.text,fontSize:17,fontWeight:'700'}}>{row.license||row.name||('Xe #'+row.vehicleId)}</Text>
            <Text style={{color:theme.muted,fontSize:15,lineHeight:24}}>Nhận lúc {dateTime(row.returnedAt)} · hạn trả {dateTime(row.returnAt)}</Text>
            <Text style={{color:theme.text,fontSize:16,lineHeight:25}}>Phí trễ {money(row.lateFee)} · sửa chữa {money(row.repairFee)} · giảm sớm {money(row.earlyDiscount)}</Text>
            {!!row.repairNote&&<Text style={{color:theme.muted,fontSize:15,lineHeight:24}}>{row.repairNote}</Text>}
          </View>)}
        </Card>
        <Card style={{gap:16}}>
          <Text accessibilityRole="header" style={{color:theme.text,fontSize:21,fontWeight:'700'}}>Thu và hoàn thực tế</Text>
          {!receipt.transactions.length&&<Text style={{color:theme.muted,fontSize:16}}>Không ghi khoản thu/hoàn trong lượt này.</Text>}
          {receipt.transactions.map((row,i)=><View key={row.id} style={{gap:6}}>
            <Text selectable style={{color:theme.text,fontSize:17,fontWeight:'700'}}>{kindLabel[row.kind]} · phiếu #{row.id} · {money(row.amount)}</Text>
            <Text style={{color:theme.muted,fontSize:15,lineHeight:24}}>{receipt.review.payments[i].label} · {dateTime(row.paidAt)}</Text>
          </View>)}
          {receipt.review.settlement.refund_deferred&&<Text style={{color:theme.warning,fontSize:16,lineHeight:25}}>Cọc chưa hoàn · còn giữ {money(receipt.review.after.depositHeld)}</Text>}
          {receipt.review.totals.totalIncrease>0&&<Text style={{color:theme.text,fontSize:16,lineHeight:25}}>Tổng phí tăng thêm {money(receipt.review.totals.totalIncrease)} theo khoản thực thu đã xác nhận.</Text>}
          {[
            ['Tổng phí sau quyết toán',money(receipt.review.after.totalAmount)],
            ['Tiền thuê đã thu',money(receipt.review.after.rentalPaid)],
            ['Còn thiếu',money(receipt.review.after.rentalRemaining)],
            ['Cọc còn giữ',money(receipt.review.after.depositHeld)],
            ['Xe còn thuê',receipt.review.after.remainingItems],
          ].map(([label,value])=><Text key={label} style={{color:theme.text,fontSize:17,lineHeight:27}}>{label}: {value}</Text>)}
        </Card>
        <Button label="Xác nhận đã kiểm tra phiếu trả xe" loading={busy} onPress={()=>{void acknowledge();}}/>
        <Button label="Tải lại phiếu trả xe" secondary loading={busy} onPress={()=>{void load();}}/>
      </>}
    </ScrollView>
    {confirm&&<ConfirmEdit title="Đối chiếu trả xe?" message="Nếu đã ghi, mở đúng phiếu gốc để kiểm tra. Nếu chưa ghi, máy chủ khóa mã cũ để chặn yêu cầu đến muộn. Xe và khoản tiền đã ghi được giữ nguyên."
      confirmLabel="Đối chiếu với máy chủ" onCancel={()=>setConfirm(false)} onConfirm={()=>{void resolve();}}/>}
  </SafeAreaView>;
}
