import {useEffect,useRef,useState} from 'react';
import {Keyboard,KeyboardAvoidingView,Platform,Pressable,RefreshControl,ScrollView,Text,View,type ScrollViewInstance} from 'react-native';
import {keepPreviousData,useQuery} from '@tanstack/react-query';
import {SafeAreaView} from 'react-native-safe-area-context';
import {RefundQrReader} from './refund-qr-reader';
import {mergeMobileRefundRecipient} from '../../../shared/mobile-refund-qr';
import type {MobileReturnPreview,MobileReturnPreviewInput} from '../../../shared/mobile-returns';
import type {MobileReturnSettlementInput,MobileReturnSettlementPreview} from '../../../shared/mobile-return-settlement';
import {useSession} from '@/providers/session';
import {useReturnWrite} from '@/hooks/use-return-write';
import {useReducedMotion} from '@/hooks/use-reduced-motion';
import {emptyReturnMoney,newReturnLine,returnFeeInput,returnSettlementInput,type ReturnLineDraft,type ReturnMoneyDraft,type ReturnReceiptDraft} from '@/lib/return-form';
import {dateTime,money,useTheme} from '@/theme';
import {Button,Card,InlineError,StateView} from './ui';
import {FormField,ChoiceField} from './form-fields';
import {RentalDateTime} from './rental-date-time';
import {ConfirmEdit} from './editor-sheet';

const methods=[{value:'cash',label:'Tiền mặt'},{value:'transfer',label:'CK tài khoản cá nhân'},{value:'company_transfer',label:'CK tài khoản công ty'}];
const kinds=[{value:'rental_debt',label:'Thu công nợ thuê xe'},{value:'late_fee',label:'Thu phí trễ'},{value:'repair_fee',label:'Thu phí sửa chữa'}];
export function ReturnEditor({id}:{id:string}) {
  const {session,api}=useSession();
  if(!api||!session||!/^[1-9]\d{0,14}$/.test(id)||!session.user.permissions.includes('contracts.read')||!session.user.permissions.includes('contracts.return'))
    return <StateView title="Không mở được trả xe" message="Tài khoản cần quyền xem hợp đồng và trả/đổi xe."/>;
  return <ReturnForm key={[api.origin,session.token,session.user.storeId,session.user.allStores,session.user.permissions.join(','),id].join(':')} id={id}/>;
}
function ReturnForm({id}:{id:string}) {
  const {api,session}=useSession(),theme=useTheme(),reducedMotion=useReducedMotion(),scroll=useRef<ScrollViewInstance>(null);
  const [page,setPage]=useState(1),[step,setStep]=useState(0),[lines,setLines]=useState<ReturnLineDraft[]>([]),[lineIndex,setLineIndex]=useState(0);
  const [fees,setFees]=useState<MobileReturnPreview|null>(null),[feeInput,setFeeInput]=useState<MobileReturnPreviewInput|null>(null);
  const [receipts,setReceipts]=useState<ReturnReceiptDraft[]>([]),[receiptIndex,setReceiptIndex]=useState(0);
  const [rentalRefund,setRentalRefund]=useState<ReturnMoneyDraft|null>(null),[depositRefund,setDepositRefund]=useState<ReturnMoneyDraft|null>(null);
  const [review,setReview]=useState<MobileReturnSettlementPreview|null>(null),[reviewInput,setReviewInput]=useState<MobileReturnSettlementInput|null>(null);
  const [previewing,setPreviewing]=useState(false),[error,setError]=useState(''),[confirm,setConfirm]=useState(false),[resolving,setResolving]=useState(false);
  const alive=useRef(true),running=useRef(false),abort=useRef<AbortController|null>(null);
  const action=useReturnWrite(id,lines.length>0||receipts.length>0||!!rentalRefund||!!depositRefund);
  const query=useQuery({queryKey:['return-preparation',session?.user.id,session?.user.storeId,session?.user.allStores,id,page],
    queryFn:({signal})=>api!.returnPreparation(id,page,signal),enabled:!!api&&action.checked&&!action.key,placeholderData:keepPreviousData,
    staleTime:30_000,gcTime:300_000,refetchOnWindowFocus:false,refetchOnReconnect:false});
  const data=query.data,locked=previewing||action.busy||!action.checked||!!action.key;
  const[qrPending,setQrPending]=useState<Record<string,boolean>>({});
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;abort.current?.abort();};},[]);
  const top=()=>{Keyboard.dismiss();scroll.current?.scrollTo({y:0,animated:!reducedMotion});};
  function clearReview(){setReview(null);setReviewInput(null);setError('');}
  function editLine(patch:Partial<ReturnLineDraft>){
    if(locked)return;setLines(rows=>rows.map((row,i)=>i===lineIndex?{...row,...patch}:row));setFees(null);setFeeInput(null);clearReview();
  }
  function defaultMoney():ReturnMoneyDraft {
    return{...emptyReturnMoney(),account:String(data?.accounts.find(row=>row.method==='cash')?.id??'')};
  }
  async function calculateFees(){
    if(!api||!data||locked||running.current)return;
    Keyboard.dismiss();setError('');
    try{
      const input=returnFeeInput(data,lines);running.current=true;setPreviewing(true);abort.current=new AbortController();
      const result=await api.returnPreview(id,input,abort.current.signal);if(!alive.current)return;
      setFees(result);setFeeInput(input);clearReview();setStep(2);top();
    }catch(cause){if(alive.current){setError((cause as Error).message);top();}}
    finally{running.current=false;if(alive.current)setPreviewing(false);}
  }
  async function calculateSettlement(acknowledged=false){
    if(!api||!data||!fees||!feeInput||locked||running.current)return;
    if(Object.values(qrPending).some(Boolean)){setError('Còn ảnh QR chưa lưu. Lưu hoặc bỏ ảnh chưa gửi ở phần người nhận trước khi rà soát quyết toán.');top();return;}
    Keyboard.dismiss();setError('');
    try{
      const input=returnSettlementInput(data,fees,feeInput,receipts,rentalRefund,depositRefund,acknowledged);
      running.current=true;setPreviewing(true);abort.current=new AbortController();
      const result=await api.returnSettlementPreview(id,input,abort.current.signal);if(!alive.current)return;
      setReview(result);setReviewInput(input);setStep(3);top();
    }catch(cause){if(alive.current){setError((cause as Error).message);top();}}
    finally{running.current=false;if(alive.current)setPreviewing(false);}
  }
  const selected=lines[lineIndex],receipt=receipts[receiptIndex];
  function moneyFields(value:ReturnMoneyDraft,onChange:(next:ReturnMoneyDraft)=>void,label:string,refund=false){
    const change=(patch:Partial<ReturnMoneyDraft>)=>{onChange({...value,...patch});clearReview();};
    return <View style={{gap:16}}>
      <FormField label={label+' (VND)'} value={value.amount} onChangeText={amount=>change({amount})} keyboardType="number-pad" editable={!locked} maxLength={13}/>
      <ChoiceField label={label+' · hình thức'} value={value.method} choices={methods} disabled={locked} onChange={method=>{
        const first=data?.accounts.find(row=>row.method===method);
        change({method:method as ReturnMoneyDraft['method'],account:first?String(first.id):''});
      }}/>
      <ChoiceField label={label+' · tài khoản'} value={value.account} disabled={locked} choices={(data?.accounts??[]).filter(row=>row.method===value.method).map(row=>({value:String(row.id),label:row.label}))} onChange={account=>change({account})}/>
      <RentalDateTime label={label.toLowerCase()} value={value.paidAt} disabled={locked} onChange={paidAt=>change({paidAt})}/>
      {refund&&value.method!=='cash'&&<>
        {lines[0]&&<RefundQrReader id={id} itemId={lines[0].vehicle.id} value={value} onPendingChange={pending=>setQrPending(old=>old[label]===pending?old:{...old,[label]:pending})} onRead={(fields,before)=>{onChange(mergeMobileRefundRecipient(value,fields,before));clearReview();}}/>}
        <FormField label={label+' · ngân hàng người nhận (tùy chọn)'} value={value.bank} editable={!locked} onChangeText={bank=>change({bank})} maxLength={150}/>
        <FormField label={label+' · số tài khoản người nhận (tùy chọn)'} value={value.recipientAccount} editable={!locked} onChangeText={recipientAccount=>change({recipientAccount})} maxLength={150}/>
        <FormField label={label+' · tên người nhận (tùy chọn)'} value={value.recipientName} editable={!locked} onChangeText={recipientName=>change({recipientName})} maxLength={150}/>
      </>}
    </View>;
  }
  const overlays=<>
    {resolving&&<ConfirmEdit title="Đối chiếu trả xe?" message="Nếu đã ghi, mở phiếu gốc để kiểm tra. Nếu chưa ghi, khóa mã cũ và giữ biểu mẫu để rà soát lại."
      confirmLabel="Đối chiếu với máy chủ" onCancel={()=>setResolving(false)} onConfirm={()=>{setResolving(false);void action.resolve().then(()=>{
        if(alive.current){setFees(null);setFeeInput(null);clearReview();setStep(lines.length?1:0);}
      });}}/>}
    {action.exit&&<ConfirmEdit title={action.busy?'Đang ghi trả xe':'Rời bước trả xe?'} busy={action.busy}
      message={action.busy?'Chờ máy chủ xác nhận kết quả.':'Nội dung chưa gửi sẽ mất. Mã yêu cầu đã gửi vẫn được giữ để đối chiếu.'}
      confirmLabel="Rời bước trả xe" onCancel={action.dismissExit} onConfirm={action.leave}/>}
    {confirm&&review&&reviewInput&&<ConfirmEdit title="Ghi trả xe và quyết toán?"
      message={'Nhận '+review.fees.items.length+' xe · thực thu '+money(review.totals.income)+' · hoàn thuê '+money(review.totals.rentalRefund)+' · hoàn cọc '+money(review.totals.depositRefund)+'. Kiểm tra tiền thực tế trước khi xác nhận.'}
      confirmLabel="Xác nhận trả xe và quyết toán" onCancel={()=>setConfirm(false)} onConfirm={()=>{setConfirm(false);if(Object.values(qrPending).some(Boolean)){setError('Còn ảnh QR chưa lưu. Lưu hoặc bỏ ảnh trước khi xác nhận.');return;}void action.submit({...reviewInput,settlement_snapshot:review.snapshot});}}/>}
  </>;
  if(!action.checked)return <SafeAreaView edges={['left','right','bottom']} style={{flex:1,backgroundColor:theme.background}}>
    <ScrollView contentContainerStyle={{padding:20}}><Card style={{gap:16}}>
      <Text accessibilityRole="header" style={{color:theme.text,fontSize:23,fontWeight:'700'}}>Kiểm tra thao tác trên thiết bị</Text>
      {!!action.error&&<InlineError message={action.error}/>}
      <Button label="Đọc lại thao tác trả xe" loading={action.checking} onPress={()=>{void action.checkPending();}}/>
      <Button label="Mở Tài khoản để đối chiếu" secondary disabled={action.checking} onPress={action.openAccount}/>
    </Card></ScrollView>{overlays}
  </SafeAreaView>;
  if(action.key)return <SafeAreaView edges={['left','right','bottom']} style={{flex:1,backgroundColor:theme.background}}>
    <ScrollView contentContainerStyle={{padding:20}}><Card style={{gap:16}}>
      <Text accessibilityRole="header" style={{color:theme.text,fontSize:25,fontWeight:'800'}}>Trả xe đang chờ đối chiếu</Text>
      <Text style={{color:theme.muted,fontSize:16,lineHeight:25}}>Kiểm tra phiếu gốc trước khi trả hoặc ghi tiền thêm. Nội dung đang nhập được giữ trong màn hình này.</Text>
      {!!action.error&&<InlineError message={action.error}/>}
      <Button label="Đối chiếu trả xe với máy chủ" loading={action.busy} onPress={()=>setResolving(true)}/>
      <Button label="Mở phiếu trả xe" secondary disabled={action.busy} onPress={action.openReceipt}/>
    </Card></ScrollView>{overlays}
  </SafeAreaView>;
  if(!data)return <><StateView title="Chuẩn bị trả xe" loading={query.isPending} message={query.isError?(query.error as Error).message:undefined} retry={query.isError?()=>{void query.refetch();}:undefined}/>{overlays}</>;
  return <SafeAreaView edges={['left','right','bottom']} style={{flex:1,backgroundColor:theme.background}}>
    <KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==='ios'?'padding':undefined}>
      <ScrollView
        ref={scroll}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={{padding:20,gap:18,maxWidth:760,width:'100%',alignSelf:'center'}}
        refreshControl={
          <RefreshControl
            refreshing={query.isRefetching}
            onRefresh={() => { void query.refetch(); }}
            tintColor={theme.primary}
          />
        }
      >
        <Text accessibilityRole="header" style={{color:theme.text,fontSize:25,fontWeight:'800'}}>{['1. Chọn xe trả','2. Phí và giờ nhận xe','3. Tiền thực thu và hoàn','4. Rà soát quyết toán'][step]}</Text>
        <Text style={{color:theme.muted,fontSize:16,lineHeight:25}}>{data.code} · đã chọn {lines.length} xe{data.ownership?' · thuê sở hữu':''}</Text>
        {!!error&&<InlineError message={error}/>}
        {!!action.error&&<InlineError message={action.error}/>}
        {!!action.notice&&<Text accessibilityLiveRegion="polite" style={{color:theme.text,fontSize:16,lineHeight:25}}>{action.notice}</Text>}
        {query.isError&&<InlineError message="Chưa cập nhật được dữ liệu trả xe. Giữ nội dung và tải lại trước khi rà soát."/>}
        {!data.available&&<InlineError message={data.blockedReason||'Hợp đồng chưa cho phép trả xe.'}/>}
        {step===0&&<>
          <Card style={{gap:14}}>
            <Text style={{color:theme.text,fontSize:16,lineHeight:25}}>Chọn các xe thực tế đã nhận. Có thể chọn qua nhiều trang, tối đa 50 xe mỗi lượt.</Text>
            {data.items.rows.map(row=>{
              const checked=lines.some(line=>line.vehicle.id===row.id);
              return <Pressable key={row.id} accessibilityRole="checkbox" accessibilityLabel={'Chọn trả xe '+(row.license||row.name||row.vehicleId)} accessibilityState={{checked,disabled:locked||!row.available||query.isPlaceholderData}}
                disabled={locked||!row.available||query.isPlaceholderData} onPress={()=>{
                  if(!checked&&lines.length>=50){setError('Mỗi lượt chọn tối đa 50 xe.');return;}
                  setLines(old=>checked?old.filter(line=>line.vehicle.id!==row.id):[...old,newReturnLine(row)]);
                  setFees(null);setFeeInput(null);clearReview();
                }} style={({pressed})=>({padding:16,gap:7,minHeight:72,borderWidth:1,borderColor:checked?theme.primary:theme.border,borderRadius:12,backgroundColor:checked?theme.tint:theme.surface,opacity:pressed?0.7:row.available?1:0.6})}>
                <Text style={{color:theme.text,fontSize:17,fontWeight:'700'}}>{checked?'Đã chọn · ':''}{row.license||row.name||('Xe #'+row.vehicleId)}</Text>
                <Text style={{color:theme.muted,fontSize:15,lineHeight:23}}>{row.returnAt?'Hạn trả '+dateTime(row.returnAt):'Chưa có hạn trả'}{row.completedAt?' · đã trả':''}</Text>
                {!!row.blockedReason&&<Text style={{color:theme.danger,fontSize:14,lineHeight:22}}>{row.blockedReason}</Text>}
              </Pressable>;
            })}
            {!data.items.rows.length&&<Text style={{color:theme.muted}}>Không có dòng xe để trả.</Text>}
          </Card>
          <Text style={{color:theme.muted,fontSize:15}}>Trang {data.items.page}/{data.items.pages}</Text>
          <Button label="Trang xe trước" secondary disabled={page<=1||locked||query.isFetching} onPress={()=>{setPage(p=>p-1);top();}}/>
          <Button label="Trang xe tiếp" secondary disabled={page>=data.items.pages||locked||query.isFetching} onPress={()=>{setPage(p=>p+1);top();}}/>
          <Button label="Nhập phí trả xe" disabled={!lines.length||locked||!data.available||query.isFetching||query.isError} onPress={()=>{setLineIndex(0);setStep(1);top();}}/>
        </>}
        {step===1&&selected&&<>
          <Card style={{gap:18}}>
            <Text accessibilityRole="header" style={{color:theme.text,fontSize:21,fontWeight:'700'}}>Xe {lineIndex+1}/{lines.length} · {selected.vehicle.license||selected.vehicle.name}</Text>
            <Text style={{color:theme.muted,fontSize:15,lineHeight:24}}>Hạn trả {dateTime(selected.vehicle.returnAt??'')} · giá ngày {selected.vehicle.dailyPrice===null?'cần đối chiếu':money(selected.vehicle.dailyPrice)}</Text>
            <RentalDateTime label="nhận xe thực tế" value={selected.returnedAt} disabled={locked} onChange={returnedAt=>editLine({returnedAt})}/>
            <FormField label="Đơn giá trễ mỗi giờ (VND)" value={selected.hourlyRate} keyboardType="number-pad" editable={!locked} maxLength={7} onChangeText={hourlyRate=>editLine({hourlyRate})}/>
            <FormField label="Phí trễ đã đối chiếu (VND, tùy chọn)" hint="Để trống để dùng phí gợi ý theo giờ/ngày. Chỉ nhập thay thế khi đã đối chiếu." value={selected.lateOverride} keyboardType="number-pad" editable={!locked} maxLength={13} onChangeText={lateOverride=>editLine({lateOverride})}/>
            <FormField label="Phí sửa chữa (VND)" value={selected.repairFee} keyboardType="number-pad" editable={!locked} maxLength={13} onChangeText={repairFee=>editLine({repairFee})}/>
            <FormField label="Nội dung sửa chữa" value={selected.repairNote} multiline editable={!locked} maxLength={1000} onChangeText={repairNote=>editLine({repairNote})}/>
            {!data.ownership&&<FormField label="Giảm doanh thu trả sớm (VND)" value={selected.earlyDiscount} keyboardType="number-pad" editable={!locked} maxLength={13} onChangeText={earlyDiscount=>editLine({earlyDiscount})}/>}
            {data.ownership&&<Text style={{color:theme.muted,fontSize:15,lineHeight:24}}>Tiền thuê sở hữu được đối chiếu theo lịch đóng tiền; không tự giảm vào kỳ đầu.</Text>}
          </Card>
          <Button label="Xe được chọn trước" secondary disabled={lineIndex<=0||locked} onPress={()=>{setLineIndex(i=>i-1);top();}}/>
          <Button label="Xe được chọn tiếp" secondary disabled={lineIndex>=lines.length-1||locked} onPress={()=>{setLineIndex(i=>i+1);top();}}/>
          <Button label="Tính phí và số dư" loading={previewing} disabled={locked&&!previewing||!data.available||query.isError} onPress={()=>{void calculateFees();}}/>
          <Button label="Sửa lựa chọn xe" secondary disabled={locked} onPress={()=>{setStep(0);top();}}/>
        </>}
        {step===2&&fees&&<>
          <Card style={{gap:12}}>
            <Text accessibilityRole="header" style={{color:theme.text,fontSize:21,fontWeight:'700'}}>Phí sau khi nhận xe</Text>
            {fees.items.map(row=><Text key={row.id} style={{color:theme.text,fontSize:16,lineHeight:25}}>{row.license||row.name}: trễ {money(row.lateFee)}, sửa {money(row.repairFee)}, giảm sớm {money(row.earlyDiscount)}</Text>)}
            <Text style={{color:theme.text,fontSize:17,lineHeight:27}}>Tổng phí {money(fees.after.totalAmount)} · còn thiếu {money(fees.after.rentalRemaining)}</Text>
            <Text style={{color:theme.muted,fontSize:15,lineHeight:24}}>Nhập tiền thực tế đã thu/hoàn. Phí gợi ý chưa phải khoản thu tiền. Cọc đang giữ {money(fees.after.depositHeld)}; còn {fees.after.remainingItems} xe.</Text>
          </Card>
          <Card style={{gap:16}}>
            <Text accessibilityRole="header" style={{color:theme.text,fontSize:21,fontWeight:'700'}}>Khoản thực thu ({receipts.length})</Text>
            {receipts.map((row,i)=><Button key={i} secondary label={'Sửa khoản thu '+(i+1)+' · '+(row.amount?money(Number(row.amount)):'chưa nhập tiền')} disabled={locked} onPress={()=>setReceiptIndex(i)}/>)}
            {receipt&&<>
              <ChoiceField label="Loại khoản thu" value={receipt.kind} choices={kinds} disabled={locked} onChange={kind=>{setReceipts(old=>old.map((r,i)=>i===receiptIndex?{...r,kind:kind as ReturnReceiptDraft['kind']}:r));clearReview();}}/>
              {moneyFields(receipt,next=>setReceipts(old=>old.map((r,i)=>i===receiptIndex?{...next,kind:r.kind}:r)),'Khoản thu '+(receiptIndex+1))}
              <Button label="Bỏ khoản thu này" secondary disabled={locked} onPress={()=>{setReceipts(old=>old.filter((_,i)=>i!==receiptIndex));setReceiptIndex(0);clearReview();}}/>
            </>}
            <Button label="Thêm khoản thực thu" secondary disabled={locked||receipts.length>=50} onPress={()=>{setReceiptIndex(receipts.length);setReceipts(old=>[...old,{...defaultMoney(),kind:'rental_debt'}]);clearReview();}}/>
          </Card>
          <Card style={{gap:16}}>
            <Text accessibilityRole="header" style={{color:theme.text,fontSize:21,fontWeight:'700'}}>Hoàn tiền thuê</Text>
            <Text style={{color:theme.muted,fontSize:15,lineHeight:24}}>Khoản giảm sớm có thể hoàn trước các khoản thu mới: {money(fees.after.rentalRefundable)}. Chỉ hoàn trong credit hợp lệ và tiền đã thu dư.</Text>
            <ChoiceField label="Ghi hoàn tiền thuê" value={rentalRefund?'yes':'no'} choices={[{value:'no',label:'Chưa ghi hoàn thuê'},{value:'yes',label:'Đã thực tế hoàn thuê'}]} disabled={locked} onChange={v=>{setRentalRefund(v==='yes'?defaultMoney():null);clearReview();}}/>
            {rentalRefund&&moneyFields(rentalRefund,setRentalRefund,'Hoàn thuê',true)}
          </Card>
          <Card style={{gap:16}}>
            <Text accessibilityRole="header" style={{color:theme.text,fontSize:21,fontWeight:'700'}}>Hoàn cọc</Text>
            <Text style={{color:theme.muted,fontSize:15,lineHeight:24}}>Đang giữ {money(fees.after.depositHeld)}. Chỉ hoàn khi đã nhận đủ xe và thu đủ công nợ.</Text>
            <ChoiceField label="Ghi hoàn cọc" value={depositRefund?'yes':'no'} choices={[{value:'no',label:'Chưa hoàn cọc'},{value:'yes',label:'Đã thực tế hoàn cọc'}]} disabled={locked||!fees.after.closesRental} onChange={v=>{setDepositRefund(v==='yes'?defaultMoney():null);clearReview();}}/>
            {depositRefund&&moneyFields(depositRefund,setDepositRefund,'Hoàn cọc',true)}
          </Card>
          <Button label="Rà soát quyết toán" loading={previewing} disabled={locked&&!previewing||query.isError} onPress={()=>{void calculateSettlement();}}/>
          <Button label="Sửa giờ và phí xe" secondary disabled={locked} onPress={()=>{setStep(1);clearReview();top();}}/>
        </>}
        {step===3&&review&&<>
          <Card style={{gap:16}}>
            <Text accessibilityRole="header" style={{color:theme.text,fontSize:21,fontWeight:'700'}}>Xác nhận tiền thực tế</Text>
            <Text style={{color:theme.text,fontSize:18,lineHeight:29}}>Nhận {review.fees.items.length} xe · còn {review.after.remainingItems} xe</Text>
            {review.payments.map((row,i)=><View key={i} style={{gap:6}}>
              <Text style={{color:theme.text,fontSize:17,fontWeight:'700'}}>{row.kind==='rental_refund'?'Hoàn thuê':row.kind==='deposit_refund'?'Hoàn cọc':kinds.find(k=>k.value===row.kind)?.label}: {money(Number(row.amount))}</Text>
              <Text style={{color:theme.muted,fontSize:15,lineHeight:24}}>{row.label} · {dateTime(row.paid_at+':00+07:00')}</Text>
            </View>)}
            {!review.payments.length&&<Text style={{color:theme.muted,fontSize:16}}>Không ghi khoản thu/hoàn trong lượt này.</Text>}
            <Text style={{color:theme.text,fontSize:17,lineHeight:27}}>Tổng phí sau quyết toán {money(review.after.totalAmount)}</Text>
            <Text style={{color:theme.text,fontSize:17,lineHeight:27}}>Còn thiếu {money(review.after.rentalRemaining)} · cọc còn giữ {money(review.after.depositHeld)}</Text>
            {review.settlement.refund_deferred&&<Text style={{color:theme.warning,fontSize:16}}>Cọc được giữ để hoàn sau.</Text>}
            {review.overpayment&&<Text accessibilityRole="alert" style={{color:theme.warning,fontSize:16,lineHeight:26}}>Tiền thực thu vượt phần còn thiếu. Tổng phí tăng thêm {money(review.totals.totalIncrease)}. Chỉ xác nhận khi đúng khoản khách đã trả.</Text>}
          </Card>
          {review.overpayment&&!review.overpaymentAcknowledged&&<Button label="Xác nhận khoản thu vượt và rà soát lại" loading={previewing} onPress={()=>{void calculateSettlement(true);}}/>}
          <Button label="Ghi trả xe và quyết toán" disabled={locked||query.isError||review.overpayment&&!review.overpaymentAcknowledged} onPress={()=>setConfirm(true)}/>
          <Button label="Sửa khoản thu và hoàn" secondary disabled={locked} onPress={()=>{setStep(2);clearReview();top();}}/>
        </>}
        <Button label="Tải lại dữ liệu trả xe" secondary loading={query.isFetching} disabled={locked} onPress={()=>{void query.refetch();}}/>
        <Button label="Ẩn bàn phím" secondary disabled={action.busy} onPress={()=>Keyboard.dismiss()}/>
      </ScrollView>
    </KeyboardAvoidingView>{overlays}
  </SafeAreaView>;
}
